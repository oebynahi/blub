import type { Metadata } from "next";
import "./globals.css";
export const metadata:Metadata={title:"Blub — life, among friends",description:"A quiet little corner for you and your friends. Share photos and catch up, in your own time.",icons:{icon:"/favicon.svg"}};
export default function Layout({children}:Readonly<{children:React.ReactNode}>){return <html lang="en"><body>{children}</body></html>}
