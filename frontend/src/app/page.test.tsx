import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import Home from "./page";
import MainPage from "./main/page";

const pushMock = vi.fn();
const replaceMock = vi.fn();
const origFetchRef = globalThis.fetch;

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
    globalThis.fetch = origFetchRef;
  });

  it("plays fallback preview immediately, without any text placeholder", async () => {
    // fetch /api/preview/queue никогда не резолвится — должно играть резервное видео сразу
    globalThis.fetch = vi.fn(async () => new Response(null, { status: 500 })) as unknown as typeof fetch;
    render(<Home />);

    // видео стартует сразу, никакого экрана-заглушки с текстом
    const video = await screen.findByTestId("preview-video");
    expect(video).toBeInTheDocument();
    expect(video.getAttribute("src")).toBe("/ГЛАВНОЕВИДЕО.mp4?v=2");
    expect(screen.queryByText("анимация")).not.toBeInTheDocument();
  });

  it("plays preview queue when own video is set, then routes to /main", async () => {
    const origFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({ own: "https://cdn/own.mp4", ad: { id: "ad1", client_name: "X", video_url: "https://cdn/ad.mp4", publish_date: "2026-10-01", end_date: "2026-10-31" } }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    ) as unknown as typeof fetch;

    render(<Home />);

    // ждём, когда очередь подтянется и видео получит src нашего ролика
    await waitFor(() => {
      expect(screen.getByTestId("preview-video").getAttribute("src")).toBe("https://cdn/own.mp4");
    });
    const video = screen.getByTestId("preview-video");
    expect(video).toBeInTheDocument();

    // играем наш ролик (фиксируем просмотр own) → закончился → переходим на рекламу
    fireEvent.play(video);
    fireEvent.ended(video);

    // реклама: ждём смены src на рекламный ролик
    await waitFor(() => {
      expect(screen.getByTestId("preview-video").getAttribute("src")).toBe("https://cdn/ad.mp4");
    });
    const video2 = screen.getByTestId("preview-video");
    fireEvent.play(video2);
    fireEvent.ended(video2);

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith("/main");
    });
    globalThis.fetch = origFetch;
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
