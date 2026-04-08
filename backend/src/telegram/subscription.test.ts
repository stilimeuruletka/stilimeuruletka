import { describe, expect, it, vi } from "vitest";
import { TelegramError } from "./telegramApi.js";
import { checkChannelSubscription, isSubscribedStatus } from "./subscription.js";

describe("isSubscribedStatus", () => {
  it("treats member/administrator/creator as subscribed", () => {
    expect(isSubscribedStatus("member")).toBe(true);
    expect(isSubscribedStatus("administrator")).toBe(true);
    expect(isSubscribedStatus("creator")).toBe(true);
  });

  it("treats left/kicked/other as not subscribed", () => {
    expect(isSubscribedStatus("left")).toBe(false);
    expect(isSubscribedStatus("kicked")).toBe(false);
    expect(isSubscribedStatus("restricted")).toBe(false);
    expect(isSubscribedStatus("unknown")).toBe(false);
  });
});

describe("checkChannelSubscription", () => {
  it("returns ok=true for subscribed statuses", async () => {
    const telegram = { getChatMember: vi.fn(async () => ({ status: "member" })) };
    const res = await checkChannelSubscription({ telegram, channelId: "@c", userId: 1 });
    expect(res).toEqual({ ok: true, status: "member" });
  });

  it("returns ok=false for not subscribed statuses", async () => {
    const telegram = { getChatMember: vi.fn(async () => ({ status: "left" })) };
    const res = await checkChannelSubscription({ telegram, channelId: "@c", userId: 1 });
    expect(res).toEqual({ ok: false, status: "left" });
  });

  it("treats Telegram API errors as not subscribed", async () => {
    const telegram = { getChatMember: vi.fn(async () => { throw new TelegramError("forbidden", 403); }) };
    const res = await checkChannelSubscription({ telegram, channelId: "@c", userId: 1 });
    expect(res).toEqual({ ok: false });
  });
});

