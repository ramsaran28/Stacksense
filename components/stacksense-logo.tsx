export function StackSenseLogo() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
      <div
        style={{
          width: "28px",
          height: "28px",
          background: "#325F57",
          borderRadius: "6px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          gap: "3px",
          padding: "5px 4px",
          flexShrink: 0,
        }}
      >
        <span style={{ display: "block", width: "100%", height: "2.5px", background: "#04151A", borderRadius: "2px" }} />
        <span
          style={{
            display: "block",
            width: "65%",
            height: "2.5px",
            background: "#04151A",
            borderRadius: "2px",
            alignSelf: "flex-start",
          }}
        />
        <span style={{ display: "block", width: "85%", height: "2.5px", background: "#04151A", borderRadius: "2px" }} />
      </div>
      <span
        style={{
          fontSize: "20px",
          fontWeight: 700,
          color: "#ffffff",
          letterSpacing: "-0.04em",
          fontFamily: "var(--font-dm-serif-display), 'DM Serif Display', serif",
          fontStyle: "normal",
        }}
      >
        StackSense
      </span>
    </div>
  )
}
