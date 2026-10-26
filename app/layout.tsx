import type { Metadata } from 'next';
import './globals.css';
export const metadata:Metadata={title:'iPhone線下門店現貨查詢',description:'查詢香港 Apple 直營店 iPhone 官網預約取貨狀態，自動同步機型、顏色及容量。'};
export default function RootLayout({children}:Readonly<{children:React.ReactNode}>){return <html lang="zh-Hant"><body>{children}</body></html>}
