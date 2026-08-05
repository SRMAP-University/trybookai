import type { Metadata } from "next";
import Link from "next/link";
import QRCode from "qrcode";
import { Navbar } from "@/components/marketing/navbar";
import { Footer } from "@/components/marketing/footer";
import { getAppUrl } from "@/lib/book-public";
import {
  ANDROID_APP_VERSION,
  getAndroidApkUrl,
  getAndroidDownloadPageUrl,
} from "@/lib/app-download";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Download BookAI for Android",
  description:
    "Download the BookAI Android app. Scan the QR code or use the direct APK link to install.",
  alternates: { canonical: `${getAppUrl()}/download` },
  openGraph: {
    title: "Download BookAI for Android",
    description:
      "Download the BookAI Android app. Scan the QR code or use the direct APK link to install.",
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
              Android app
            </p>
            <h1 className="landing-heading mt-3 text-center">
              Download BookAI
            </h1>
            <p className="mx-auto mt-4 max-w-[520px] text-center text-[17px] leading-relaxed text-[#425466]">
              Scan the QR code with your phone, or tap the download button to
              install the APK. Updates can ship over-the-air via Shorebird.
            </p>

            <div className="mx-auto mt-12 grid max-w-[760px] gap-10 md:grid-cols-[280px_1fr] md:items-center">
              <div className="mx-auto rounded-2xl border border-[#e8e8e6] bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={qrDataUrl}
                  alt="QR code to download BookAI Android APK"
                  width={280}
                  height={280}
                  className="h-[240px] w-[240px] sm:h-[280px] sm:w-[280px]"
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
                  className="landing-btn-dark inline-flex w-full items-center justify-center sm:w-auto"
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
              <li>Open the download on your Android phone.</li>
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
