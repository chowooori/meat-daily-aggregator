import { AggregatorApp } from "@/components/AggregatorApp";

export default function HomePage() {
  return (
    <div className="app-shell">
      <header className="topbar">
        <p className="eyebrow">Daily Production</p>
        <h1>일일 생산 집계</h1>
        <p className="muted">
          발송 엑셀을 올리면 차수별 제조 수량과 육회·육사시미 중량이 바로
          나옵니다. 업로드한 파일은 브라우저에서만 처리되며 서버로 전송되지
          않습니다.
        </p>
      </header>
      <AggregatorApp />
    </div>
  );
}
