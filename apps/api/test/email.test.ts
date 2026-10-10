import { describe, expect, it } from "vitest";

import {
  type Email,
  brevoMailer,
  memoryMailer,
  parseSender,
  routedMailer,
} from "../src/lib/email.js";

const email = {
  to: "member@university.example",
  subject: "123456 is your Anime Manga Club sign-in code",
  text: "Hi,\n\n123456",
  html: "<p>Hi,</p><p>123456</p>",
};

describe("parseSender", () => {
  it("reads a name and address, or a bare address", () => {
    expect(parseSender("Anime Manga Club <club@mail.example.com>")).toEqual({
      name: "Anime Manga Club",
      email: "club@mail.example.com",
    });
    expect(parseSender('"Club" <club@mail.example.com>')).toEqual({
      name: "Club",
      email: "club@mail.example.com",
    });
    expect(parseSender("club@mail.example.com")).toEqual({ email: "club@mail.example.com" });
    expect(parseSender("Anime Manga Club")).toBeNull();
  });
});

describe("brevoMailer", () => {
  it("sends through Brevo's transactional email API", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const mailer = brevoMailer({
      apiKey: "xkeysib-test",
      from: "Anime Manga Club <club@mail.example.com>",
      fetch: (url, init = {}) => {
        calls.push({ url: url instanceof Request ? url.url : url.toString(), init });
        return Promise.resolve(Response.json({ messageId: "<1@relay>" }, { status: 201 }));
      },
    });

    await mailer.send(email);

    expect(calls).toHaveLength(1);
    const [call] = calls;
    expect(call?.url).toBe("https://api.brevo.com/v3/smtp/email");
    expect(call?.init.method).toBe("POST");
    expect(call?.init.headers).toMatchObject({ "api-key": "xkeysib-test" });
    expect(JSON.parse(call?.init.body as string)).toEqual({
      sender: { name: "Anime Manga Club", email: "club@mail.example.com" },
      to: [{ email: email.to }],
      subject: email.subject,
      htmlContent: email.html,
      textContent: email.text,
    });
  });

  it("fails loudly when Brevo refuses", async () => {
    const mailer = brevoMailer({
      apiKey: "xkeysib-test",
      from: "club@mail.example.com",
      fetch: () =>
        Promise.resolve(
          Response.json({ code: "unauthorized", message: "Key not found" }, { status: 401 }),
        ),
    });
    await expect(mailer.send(email)).rejects.toThrow(/Brevo rejected the email: 401/);
  });
});

describe("routedMailer", () => {
  const to = (address: string): Email => ({ ...email, to: address });

  it("only prints test accounts' emails, so they never bounce", async () => {
    const deliver = memoryMailer();
    const log = memoryMailer();
    const mailer = routedMailer({ deliver, log, alsoLog: false });

    await mailer.send(to("e2e-member@example.com"));
    await mailer.send(to("member@university.example"));

    expect(deliver.sent.map((e) => e.to)).toEqual(["member@university.example"]);
    expect(log.sent.map((e) => e.to)).toEqual(["e2e-member@example.com"]);
  });

  it("prints real emails too in development, and everything without a sender", async () => {
    const log = memoryMailer();
    const deliver = memoryMailer();
    await routedMailer({ deliver, log, alsoLog: true }).send(to("member@university.example"));
    expect(log.sent).toHaveLength(1);
    expect(deliver.sent).toHaveLength(1);

    const logOnly = memoryMailer();
    await routedMailer({ deliver: null, log: logOnly, alsoLog: false }).send(email);
    expect(logOnly.sent).toHaveLength(1);
  });
});
