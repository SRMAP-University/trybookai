"""Local unauthenticated HTTP proxy that forwards to an authenticated upstream.

Android emulator uses 10.0.2.2:<local_port> (host loopback).
Upstream auth is injected here so emulator -http-proxy needs no credentials.
"""

from __future__ import annotations

import argparse
import base64
import socket
import socketserver
import threading
from urllib.parse import unquote, urlparse


class ForwardingProxy(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


class Handler(socketserver.BaseRequestHandler):
    upstream_host: str = ""
    upstream_port: int = 0
    proxy_auth: str = ""

    def handle(self) -> None:
        client: socket.socket = self.request
        client.settimeout(60)
        upstream: socket.socket | None = None
        try:
            header_blob = self._recv_headers(client)
            if not header_blob:
                return

            first, _, rest = header_blob.partition(b"\r\n")
            parts = first.decode("latin-1", errors="replace").split()
            if len(parts) < 2:
                client.sendall(b"HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n")
                return

            method, target = parts[0].upper(), parts[1]
            upstream = socket.create_connection(
                (self.upstream_host, self.upstream_port), timeout=30
            )
            upstream.settimeout(60)
            auth = f"Proxy-Authorization: Basic {self.proxy_auth}\r\n".encode("ascii")

            if method == "CONNECT":
                req = (
                    f"CONNECT {target} HTTP/1.1\r\nHost: {target}\r\n"
                    f"Proxy-Connection: keep-alive\r\n"
                ).encode("latin-1") + auth + b"\r\n"
                upstream.sendall(req)
                resp = self._recv_headers(upstream)
                if not resp or b" 200" not in resp.split(b"\r\n", 1)[0]:
                    client.sendall(
                        resp
                        or b"HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\n\r\n"
                    )
                    return
                # Always tell client CONNECT succeeded with a clean response
                client.sendall(b"HTTP/1.1 200 Connection Established\r\n\r\n")
                # If upstream sent body bytes after headers, forward them
                _, _, leftover = resp.partition(b"\r\n\r\n")
                if leftover:
                    client.sendall(leftover)
                self._pipe(client, upstream)
            else:
                # Strip any client Proxy-Authorization; inject ours
                lines = rest.split(b"\r\n")
                kept = [
                    line
                    for line in lines
                    if line
                    and not line.lower().startswith(b"proxy-authorization:")
                ]
                body_sep = b"\r\n\r\n"
                # rest already excludes first line but includes trailing \r\n\r\n content
                pre, sep, body = rest.partition(b"\r\n\r\n")
                header_lines = [
                    line
                    for line in pre.split(b"\r\n")
                    if line
                    and not line.lower().startswith(b"proxy-authorization:")
                ]
                out = first + b"\r\n" + auth + b"\r\n".join(header_lines) + b"\r\n\r\n" + body
                upstream.sendall(out)
                self._pipe(client, upstream)
        except Exception:
            try:
                client.sendall(b"HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\n\r\n")
            except Exception:
                pass
        finally:
            if upstream is not None:
                try:
                    upstream.close()
                except Exception:
                    pass
            try:
                client.close()
            except Exception:
                pass

    @staticmethod
    def _recv_headers(sock: socket.socket) -> bytes:
        data = b""
        while b"\r\n\r\n" not in data:
            chunk = sock.recv(4096)
            if not chunk:
                break
            data += chunk
            if len(data) > 65536:
                break
        return data

    @staticmethod
    def _pipe(a: socket.socket, b: socket.socket) -> None:
        def one_way(src: socket.socket, dst: socket.socket) -> None:
            try:
                while True:
                    data = src.recv(65536)
                    if not data:
                        break
                    dst.sendall(data)
            except Exception:
                pass
            finally:
                try:
                    dst.shutdown(socket.SHUT_WR)
                except Exception:
                    pass

        t1 = threading.Thread(target=one_way, args=(a, b), daemon=True)
        t2 = threading.Thread(target=one_way, args=(b, a), daemon=True)
        t1.start()
        t2.start()
        t1.join()
        t2.join()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--listen", default="127.0.0.1:8888")
    parser.add_argument("--upstream", required=True, help="http://user:pass@host:port")
    args = parser.parse_args()

    listen_host, listen_port_s = args.listen.rsplit(":", 1)
    listen_port = int(listen_port_s)

    up = urlparse(args.upstream)
    if not up.hostname or not up.port or not up.username or up.password is None:
        raise SystemExit("Upstream must be http://user:pass@host:port")

    user = unquote(up.username)
    password = unquote(up.password)
    Handler.upstream_host = up.hostname
    Handler.upstream_port = up.port
    Handler.proxy_auth = base64.b64encode(f"{user}:{password}".encode("utf-8")).decode(
        "ascii"
    )

    server = ForwardingProxy((listen_host, listen_port), Handler)
    print(
        f"Local proxy on {listen_host}:{listen_port} -> "
        f"{Handler.upstream_host}:{Handler.upstream_port}",
        flush=True,
    )
    print(f"Emulator flag: -http-proxy http://10.0.2.2:{listen_port}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
