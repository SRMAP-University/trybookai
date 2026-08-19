import type { Metadata } from "next";
import Link from "next/link";
import QRCode from "qrcode";
import { Navbar } from "@/components/marketing/navbar";
import { Footer } from "@/components/marketing/footer";
import { WebInstallSection } from "@/components/pwa/web-install-section";
import { getAppUrl } from "@/lib/book-public";
import {
  ANDROID_APP_VERSION,
  getAndroidApkUrl,
  getAndroidDownloadPageUrl,
} from "@/lib/app-download";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Install BookAI",
  description:
    "Install BookAI as a web app on your phone or desktop, or download the Android APK.",
  alternates: { canonical: `${getAppUrl()}/download` },
  openGraph: {
    title: "Install BookAI",
    description:
      "Install BookAI as a web app on your phone or desktop, or download the Android APK.",
    url: `${getAppUrl()}/download`,
    type: "website",
  },
};

export default async function DownloadPage() {
  const apkUrl = getAndroidApkUrl();
  const pageUrl = getAndroidDownloadPageUrl();
  const qrDataUrl = await QRCode.toDataURL(apkUrl, {
    width: 280,
    margin: 2,
    color: { dark: "#0a2540", light: "#ffffff" },
    errorCorrectionLevel: "M",
  });

  return (
    <div className="landing-root min-h-screen overflow-x-hidden">
      <Navbar />
      <main>
        <section className="landing-section pt-28 pb-20">
          <div className="mx-auto max-w-[920px] px-6">
            <p className="text-center text-[13px] font-medium uppercase tracking-[0.08em] text-[#6b6b6b]">
              Install BookAI
            </p>
            <h1 className="landing-heading mt-3 text-center">
              Install on any device
            </h1>
            <p className="mx-auto mt-4 max-w-[560px] text-center text-[17px] leading-relaxed text-[#425466]">
              Install the BookAI web app for quick access, or download the native
              Android APK if you prefer a standalone mobile build.
            </p>

            <div id="pwa" className="mx-auto mt-10 max-w-[760px]">
              <WebInstallSection />
            </div>

            <div className="mx-auto mt-14 max-w-[760px] border-t border-[#e8e8e6] pt-12">
              <p className="text-center text-[13px] font-medium uppercase tracking-[0.08em] text-[#6b6b6b]">
                Android app
              </p>
              <h2 className="landing-heading mt-3 text-center text-[32px]">
                Download APK
              </h2>
            </div>

            <p className="mx-auto mt-4 max-w-[520px] text-center text-[17px] leading-relaxed text-[#425466] md:hidden">
              Tap the button below to install the APK on this phone. Enable
              “Install unknown apps” if Android asks.
            </p>
            <p className="mx-auto mt-4 hidden max-w-[520px] text-center text-[17px] leading-relaxed text-[#425466] md:block">
              Scan the QR code with your phone, or use the download button.
              Updates can ship over-the-air via Shorebird.
            </p>

            <div className="mx-auto mt-10 max-w-[420px] space-y-4 md:hidden">
              <p className="text-center text-[14px] font-medium text-[#0a2540]">
                Version {ANDROID_APP_VERSION}
              </p>
              <a
                href={apkUrl}
                className="landing-btn-dark inline-flex w-full items-center justify-center"
                download="bookai.apk"
              >
                Download APK
              </a>
              <a
                href={apkUrl}
                className="inline-flex w-full items-center justify-center rounded-full border border-[#e8e8e6] bg-white px-5 py-3 text-[15px] font-medium text-[#0a2540]"
              >
                Direct install link
              </a>
            </div>

            <div className="mx-auto mt-12 hidden max-w-[760px] gap-10 md:grid md:grid-cols-[280px_1fr] md:items-center">
              <div className="mx-auto rounded-2xl border border-[#e8e8e6] bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={qrDataUrl}
                  alt="QR code to download BookAI Android APK"
                  width={280}
                  height={280}
                  className="h-[280px] w-[280px]"
                />
                <p className="mt-3 text-center text-[13px] text-[#6b6b6b]">
                  Scan to download
                </p>
              </div>

              <div className="space-y-5">
                <div>
                  <p className="text-[14px] font-medium text-[#0a2540]">
                    Version {ANDROID_APP_VERSION}
                  </p>
                  <p className="mt-1 text-[14px] leading-relaxed text-[#6b6b6b]">
                    Direct install APK for Android. Enable “Install unknown
                    apps” for your browser if prompted.
                  </p>
                </div>

                <a
                  href={apkUrl}
                  className="landing-btn-dark inline-flex w-auto items-center justify-center"
                  download="bookai.apk"
                >
                  Download APK
                </a>

                <div className="rounded-xl border border-[#e8e8e6] bg-[#fafafa] px-4 py-3">
                  <p className="text-[12px] font-medium uppercase tracking-[0.06em] text-[#6b6b6b]">
                    Download link
                  </p>
                  <a
                    href={apkUrl}
                    className="mt-1 block break-all text-[14px] text-[#635bff] hover:underline"
                  >
                    {apkUrl}
                  </a>
                </div>

                <p className="text-[13px] text-[#6b6b6b]">
                  Share this page:{" "}
                  <Link
                    href="/download"
                    className="text-[#0a2540] underline-offset-2 hover:underline"
                  >
                    {pageUrl}
                  </Link>
                </p>
              </div>
            </div>

            <ol className="mx-auto mt-14 max-w-[560px] list-decimal space-y-3 pl-5 text-[15px] leading-relaxed text-[#425466]">
              <li>Tap Download APK on your Android phone.</li>
              <li>Allow installs from the browser if Android asks.</li>
              <li>Open the APK and tap Install.</li>
              <li>Sign in with the same BookAI account you use on the web.</li>
            </ol>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
