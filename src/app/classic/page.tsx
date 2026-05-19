import { TaskApp as ClassicTaskApp } from "@/components/task-app-classic";

const previewBuckets = ["Inbox", "Today", "Focus", "Recurring", "Waiting", "Later", "Done", "Missed"];

function BucketTrayPreview() {
  return (
    <section className="mx-auto mb-8 w-full max-w-6xl px-6 pt-8">
      <div className="rounded-[2rem] border border-[#eee7ff] bg-[linear-gradient(180deg,#fcfbff_0%,#f8f4ff_100%)] p-6 shadow-[0_28px_80px_rgba(116,88,255,0.12)]">
        <div className="max-w-2xl">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#9b92be]">
            Bucket Menu Preview
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-[#342d56]">
            Floating chip tray concept
          </h2>
          <p className="mt-2 text-sm leading-6 text-[#726a96]">
            This version keeps the active bucket as the same quiet chip, then opens into a softer chip tray instead of a panel full of controls.
          </p>
        </div>

        <div className="mt-6 flex flex-wrap items-start gap-6">
          <div className="rounded-[1.5rem] border border-[#ede6ff] bg-white/80 px-5 py-5 shadow-[0_18px_40px_rgba(121,93,255,0.08)] backdrop-blur">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#a097c4]">
              Trigger
            </p>
            <button
              className="mt-3 appearance-none border-0 bg-transparent p-0 text-left"
              type="button"
            >
              <span className="inline-flex items-center rounded-full bg-[#f4f5f8] px-2.5 py-1 text-[11px] font-semibold leading-none text-[#68738c] whitespace-nowrap">
                Inbox
              </span>
            </button>
          </div>

          <div className="relative rounded-[1.75rem] bg-white/78 px-4 py-4 shadow-[0_24px_60px_rgba(115,88,255,0.14)] ring-1 ring-[#ede6ff] backdrop-blur-md">
            <div className="pointer-events-none absolute inset-x-5 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(128,100,255,0.35),transparent)]" />
            <p className="px-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#a097c4]">
              Floating Tray
            </p>
            <div className="mt-3 flex max-w-[19rem] flex-wrap gap-2">
              {previewBuckets.map((bucket) => (
                <button
                  className="appearance-none border-0 bg-transparent p-0 text-left"
                  key={bucket}
                  type="button"
                >
                  <span
                    className={`inline-flex items-center rounded-full px-3 py-1.5 text-[13px] font-semibold leading-none whitespace-nowrap ${
                      bucket === "Inbox"
                        ? "bg-[#efe9ff] text-[#6f57f6] shadow-[0_6px_18px_rgba(111,87,246,0.18)]"
                        : "bg-[#f4f5f8] text-[#7c86a1]"
                    }`}
                  >
                    {bucket}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default function ClassicPage() {
  return (
    <>
      <BucketTrayPreview />
      <ClassicTaskApp />
    </>
  );
}
