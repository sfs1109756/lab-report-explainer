interface Props {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  onFile: (f: File) => void;
  busy: boolean;
  placeholder: string;
}

/** One report: paste box plus PDF/TXT upload. */
export function ReportInput({ label, value, onChange, onFile, busy, placeholder }: Props) {
  return (
    <div className="report-input">
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 6 }}>
        {label ? <strong className="small">{label}</strong> : <span />}
        <label className="file small">
          {busy ? <span className="spinner" /> : '⇪'} Upload PDF
          <input
            type="file"
            accept=".pdf,.txt,application/pdf,text/plain"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onFile(f);
              e.target.value = '';
            }}
          />
        </label>
      </div>
      <textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  );
}
