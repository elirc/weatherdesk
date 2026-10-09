import { describe, expect, it } from "vitest";
import { attachmentRef, buildEmailMessage, parsePayload } from "@/worker/core/messages";

// A5's binding report-notification payload shape
const reportPayload = parsePayload({
  subject: "Weekly report: Lagos, 28 Sep – 4 Oct 2026",
  text: "Your weekly report is ready.\n\nPDF: http://localhost:3000/reports/r1/pdf",
  reportId: "r1",
  url: "http://localhost:3000/reports/r1",
  pdfUrl: "http://localhost:3000/reports/r1/pdf",
  attachment: { key: "reports/r1.pdf", filename: "weatherdesk-lagos-2026-09-28.pdf", contentType: "application/pdf" },
});

const pdf = { content: Buffer.from("%PDF-1.7 test"), contentType: "application/octet-stream" };

describe("attachmentRef", () => {
  it("reads a well-formed ref", () => {
    expect(attachmentRef(reportPayload)).toEqual({
      key: "reports/r1.pdf",
      filename: "weatherdesk-lagos-2026-09-28.pdf",
      contentType: "application/pdf",
    });
  });
  it("is null when absent or malformed (never throws)", () => {
    expect(attachmentRef(parsePayload({ text: "hi" }))).toBeNull();
    expect(attachmentRef(parsePayload({ text: "hi", attachment: "reports/r1.pdf" }))).toBeNull();
    expect(attachmentRef(parsePayload({ text: "hi", attachment: { filename: "a.pdf" } }))).toBeNull();
    expect(attachmentRef(parsePayload({ text: "hi", attachment: { key: "k" } }))).toBeNull();
  });
});

describe("buildEmailMessage", () => {
  it("attaches the stored file with the payload's filename and content type", () => {
    const msg = buildEmailMessage(reportPayload, "user@example.com", "http://localhost:3000", pdf);
    expect(msg).toMatchObject({ to: "user@example.com", subject: reportPayload.subject, text: reportPayload.text });
    expect(msg.html).toContain("Your weekly report is ready.");
    expect(msg.attachments).toEqual([
      { filename: "weatherdesk-lagos-2026-09-28.pdf", content: pdf.content, contentType: "application/pdf" },
    ]);
  });

  it("falls back to sending without an attachment when storage returned null", () => {
    const msg = buildEmailMessage(reportPayload, "user@example.com", "http://localhost:3000", null);
    expect(msg.attachments).toBeUndefined();
    expect(msg.text).toContain("/reports/r1/pdf"); // the link still reaches the reader
  });

  it("ignores a stored file when the payload has no attachment ref", () => {
    const msg = buildEmailMessage(parsePayload({ text: "Alert" }), "u@x", "http://x", pdf);
    expect(msg.attachments).toBeUndefined();
    expect(msg.subject).toBe("WeatherDesk");
  });

  it("uses the stored object's content type when the ref omits one, and keeps provided html", () => {
    const p = parsePayload({ text: "t", html: "<p>custom</p>", attachment: { key: "k", filename: "f.pdf" } });
    const msg = buildEmailMessage(p, "u@x", "http://x", { content: Buffer.from("x"), contentType: "application/pdf" });
    expect(msg.html).toBe("<p>custom</p>");
    expect(msg.attachments?.[0].contentType).toBe("application/pdf");
  });
});
