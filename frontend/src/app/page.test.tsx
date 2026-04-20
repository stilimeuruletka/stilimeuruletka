import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
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

  it("opens friend page from invite card", async () => {
    render(<MainPage />);

    const invite = await screen.findAllByRole("link", { name: "Пригласить друзей" });
    expect(invite[invite.length - 1]).toHaveAttribute("href", "/main/friend");
  });
});
