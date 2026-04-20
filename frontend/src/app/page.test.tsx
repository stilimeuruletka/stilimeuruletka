import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import Home from "./page";
import MainPage from "./main/page";

const pushMock = vi.fn();
const replaceMock = vi.fn();

vi.mock("next/navigation", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    useRouter: () => ({
      push: pushMock,
      replace: replaceMock,
      prefetch: vi.fn()
    })
  };
});

describe("Home", () => {
  afterEach(() => {
    cleanup();
    pushMock.mockReset();
    replaceMock.mockReset();
    delete (window as unknown as Record<string, unknown>).Telegram;
  });

  it("renders splash link to main", async () => {
    render(<Home />);

    const link = await screen.findByRole("link", { name: "анимация" });
    expect(link).toHaveAttribute("href", "/main");
  });

  it("renders main screen layout", async () => {
    window.Telegram = {
      WebApp: { initData: "initData", ready: vi.fn(), expand: vi.fn() }
    };

    render(<MainPage />);

    expect(await screen.findByAltText("Верхняя часть")).toBeInTheDocument();
    expect(await screen.findByAltText("Заголовок")).toBeInTheDocument();
    expect((await screen.findAllByAltText("Девушка 1"))[0]).toBeInTheDocument();
    expect((await screen.findAllByAltText("Девушка 2"))[0]).toBeInTheDocument();
    expect((await screen.findAllByAltText("Девушка 3"))[0]).toBeInTheDocument();
    expect((await screen.findAllByAltText("Девушка 4"))[0]).toBeInTheDocument();
    expect((await screen.findAllByAltText("Девушка 5"))[0]).toBeInTheDocument();
    expect((await screen.findAllByAltText("Девушка 6"))[0]).toBeInTheDocument();
    expect((await screen.findAllByAltText("Низ"))[0]).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Стильная рулетка" })[0]).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Профиль" })[0]).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Как играть" })[0]).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Пригласить друзей" })[0]).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Список призов" })[0]).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Поддержка" })[0]).toBeInTheDocument();

    await waitFor(() => {
      expect(window.Telegram?.WebApp?.ready).toHaveBeenCalled();
      expect(window.Telegram?.WebApp?.expand).toHaveBeenCalled();
    });
  });

  it("copies referral link and opens Telegram share on invite card click", async () => {
    const showAlert = vi.fn();
    const openTelegramLink = vi.fn();
    window.Telegram = {
      WebApp: { initData: "initData-long-enough", ready: vi.fn(), expand: vi.fn() }
    };
    if (window.Telegram?.WebApp) {
      (window.Telegram.WebApp as unknown as Record<string, unknown>).showAlert = showAlert;
      (window.Telegram.WebApp as unknown as Record<string, unknown>).openTelegramLink = openTelegramLink;
    }

    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });

    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ link: "https://t.me/test?startapp=ref_abc" })
    }));
    Object.defineProperty(globalThis, "fetch", { value: fetchMock, configurable: true });

    pushMock.mockClear();
    render(<MainPage />);

    const invite = await screen.findAllByRole("link", { name: "Пригласить друзей" });
    fireEvent.click(invite[invite.length - 1]!);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
      expect(writeText).toHaveBeenCalledWith("https://t.me/test?startapp=ref_abc");
      expect(showAlert).toHaveBeenCalled();
      expect(openTelegramLink).toHaveBeenCalledWith("https://t.me/share/url?url=https%3A%2F%2Ft.me%2Ftest%3Fstartapp%3Dref_abc");
    });

    fireEvent.click(invite[invite.length - 1]!);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(openTelegramLink).toHaveBeenCalledTimes(2);
    });
  });
});
