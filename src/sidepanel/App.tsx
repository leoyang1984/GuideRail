import { LibraryApp } from './LibraryApp';
export function App() {
  return typeof chrome !== 'undefined' && chrome.storage ? <LibraryApp /> : <main className="reader-app"><h1>GuideRail</h1><p>请在 Chrome 扩展中打开。</p></main>;
}
