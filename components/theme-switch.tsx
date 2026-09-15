"use client";

import { type FC, useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import clsx from "clsx";

import { SunFilledIcon, MoonFilledIcon } from "@/components/icons";

export interface ThemeSwitchProps {
  className?: string;
}

const subscribe = () => () => undefined;
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

export const ThemeSwitch: FC<ThemeSwitchProps> = ({ className }) => {
  const isMounted = useSyncExternalStore(
    subscribe,
    getClientSnapshot,
    getServerSnapshot,
  );
  const { setTheme, resolvedTheme } = useTheme();

  const isLight = resolvedTheme === "light";

  const handleToggle = () => {
    setTheme(isLight ? "dark" : "light");
  };

  if (!isMounted) return <div aria-hidden className="w-6 h-6" />;

  return (
    <button
      aria-label={`Switch to ${isLight ? "dark" : "light"} mode`}
      className={clsx(
        "px-px transition-opacity hover:opacity-80 cursor-pointer",
        "inline-flex items-center justify-center",
        "w-auto h-auto bg-transparent rounded-lg text-muted",
        className,
      )}
      onClick={handleToggle}
    >
      {isLight ? <SunFilledIcon size={22} /> : <MoonFilledIcon size={22} />}
    </button>
  );
};
