import type { Metadata } from "next";
import "./globals.css";
export const metadata:Metadata={title:"Blub — photos with friends",description:"Share photos with friends in a private, chronological feed.",icons:{icon:"/favicon.svg"}};
export default function Layout({children}:Readonly<{children:React.ReactNode}>){return <html lang="en" data-theme="dark"><body>{children}</body></html>}
