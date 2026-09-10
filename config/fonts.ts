import { Manrope, Instrument_Serif } from "next/font/google";

export const fontSans = Manrope({
  subsets: ["latin"],
  variable: "--font-studio-sans",
});
export const fontDisplay = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  variable: "--font-display",
});
