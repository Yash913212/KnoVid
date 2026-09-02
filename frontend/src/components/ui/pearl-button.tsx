import React from "react";

type PearlButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  label?: string;
};

export const PearlButton: React.FC<PearlButtonProps> = ({
  label = "Pearl Button",
  className = "",
  ...props
}) => {
  return (
    <>
      <style>{`
        .pearl-button {
          --white: #ffe7ff;
          --bg: #080808;
          --radius: 100px;
          outline: none;
          cursor: pointer;
          border: 0;
          position: relative;
          border-radius: var(--radius);
          background-color: var(--bg);
          transition: transform 0.2s ease, box-shadow 0.3s ease, border-color 0.3s ease, background-color 0.3s ease, filter 0.3s ease;
          box-shadow:
            inset 0 0.3rem 0.9rem rgba(255, 255, 255, 0.3),
            inset 0 -0.1rem 0.3rem rgba(0, 0, 0, 0.7),
            inset 0 -0.4rem 0.9rem rgba(255, 255, 255, 0.5),
            0 3rem 3rem rgba(0, 0, 0, 0.3),
            0 1rem 1rem -0.6rem rgba(0, 0, 0, 0.8);
        }
        /* ── Light theme: mineral paper pearl ── */
        html:not(.dark) .pearl-button {
          --bg: #ffffff;
          border: 1px solid rgba(24,32,30,0.10);
          box-shadow:
            inset 0 0.2rem 0.7rem rgba(255,255,255,1),
            inset 0 -0.08rem 0.22rem rgba(24,32,30,0.08),
            inset 0 -0.35rem 0.75rem rgba(24,32,30,0.05),
            0 1.4rem 2.2rem rgba(24,32,30,0.10),
            0 0.6rem 1rem -0.4rem rgba(24,32,30,0.14);
        }
        /* ── Dark theme: deep ink pearl (explicit, matches KnoVid night) ── */
        html.dark .pearl-button {
          --bg: #08080a;
          border: 0;
          box-shadow:
            inset 0 0.3rem 0.9rem rgba(255, 255, 255, 0.28),
            inset 0 -0.1rem 0.3rem rgba(0, 0, 0, 0.75),
            inset 0 -0.4rem 0.9rem rgba(255, 255, 255, 0.45),
            0 0 0 1px rgba(193,126,249,0.12),
            0 3rem 3rem rgba(0, 0, 0, 0.45),
            0 1rem 1rem -0.6rem rgba(0, 0, 0, 0.9);
        }
        .pearl-button .wrap {
          font-size: 25px;
          font-weight: 500;
          color: rgba(255, 255, 255, 0.78);
          padding: 32px 45px;
          border-radius: inherit;
          position: relative;
          overflow: hidden;
        }
        html:not(.dark) .pearl-button .wrap {
          color: rgba(24,32,30,0.86);
          font-weight: 600;
        }
        html.dark .pearl-button .wrap {
          color: rgba(238,243,236,0.82);
        }
        .pearl-button .wrap p span:nth-child(2) {
          display: none;
        }
        .pearl-button:hover .wrap p span:nth-child(1) {
          display: none;
        }
        .pearl-button:hover .wrap p span:nth-child(2) {
          display: inline-block;
        }
        .pearl-button .wrap p {
          display: flex;
          align-items: center;
          gap: 12px;
          margin: 0;
          transition: transform 0.2s ease, opacity 0.2s ease;
          transform: translateY(2%);
          -webkit-mask-image: linear-gradient(to bottom, white 40%, transparent);
                  mask-image: linear-gradient(to bottom, white 40%, transparent);
        }
        .pearl-button .wrap::before,
        .pearl-button .wrap::after {
          content: "";
          position: absolute;
          transition: transform 0.3s ease, opacity 0.3s ease;
        }
        .pearl-button .wrap::before {
          left: -15%;
          right: -15%;
          bottom: 25%;
          top: -100%;
          border-radius: 50%;
          background-color: rgba(255, 255, 255, 0.12);
        }
        html:not(.dark) .pearl-button .wrap::before {
          background-color: rgba(24,32,30,0.04);
        }
        html.dark .pearl-button .wrap::before {
          background-color: rgba(255,255,255,0.10);
        }
        .pearl-button .wrap::after {
          left: 6%;
          right: 6%;
          top: 12%;
          bottom: 40%;
          border-radius: 22px 22px 0 0;
          box-shadow: inset 0 10px 8px -10px rgba(255, 255, 255, 0.8);
          background: linear-gradient(
            180deg,
            rgba(255, 255, 255, 0.3) 0%,
            rgba(0, 0, 0, 0) 50%,
            rgba(0, 0, 0, 0) 100%
          );
        }
        html:not(.dark) .pearl-button .wrap::after {
          box-shadow: inset 0 9px 8px -9px rgba(255,255,255,0.95);
          background: linear-gradient(180deg, rgba(255,255,255,0.85) 0%, rgba(255,255,255,0.45) 48%, transparent 100%);
        }
        html.dark .pearl-button .wrap::after {
          box-shadow: inset 0 10px 8px -10px rgba(255,255,255,0.75);
          background: linear-gradient(180deg, rgba(255,255,255,0.26) 0%, rgba(255,255,255,0.06) 45%, transparent 100%);
        }
        .pearl-button:hover {
          box-shadow:
            inset 0 0.3rem 0.5rem rgba(255, 255, 255, 0.4),
            inset 0 -0.1rem 0.3rem rgba(0, 0, 0, 0.7),
            inset 0 -0.4rem 0.9rem rgba(255, 255, 255, 0.7),
            0 3rem 3rem rgba(0, 0, 0, 0.3),
            0 1rem 1rem -0.6rem rgba(0, 0, 0, 0.8);
        }
        html:not(.dark) .pearl-button:hover {
          box-shadow:
            inset 0 0.2rem 0.5rem rgba(255,255,255,1),
            inset 0 -0.08rem 0.22rem rgba(24,32,30,0.10),
            inset 0 -0.30rem 0.7rem rgba(24,32,30,0.06),
            0 1.6rem 2.6rem rgba(24,32,30,0.13),
            0 0.7rem 1.1rem -0.4rem rgba(24,32,30,0.16);
          border-color: rgba(24,32,30,0.14);
        }
        html.dark .pearl-button:hover {
          box-shadow:
            inset 0 0.3rem 0.55rem rgba(255,255,255,0.36),
            inset 0 -0.1rem 0.3rem rgba(0,0,0,0.75),
            inset 0 -0.4rem 0.9rem rgba(255,255,255,0.55),
            0 0 0 1px rgba(184,217,107,0.18),
            0 3rem 3rem rgba(0,0,0,0.45),
            0 1rem 1rem -0.6rem rgba(0,0,0,0.9);
        }
        .pearl-button:hover .wrap::before {
          transform: translateY(-5%);
        }
        .pearl-button:hover .wrap::after {
          opacity: 0.4;
          transform: translateY(5%);
        }
        .pearl-button:hover .wrap p {
          transform: translateY(-4%);
        }
        .pearl-button:active {
          transform: translateY(4px);
          box-shadow:
            inset 0 0.3rem 0.5rem rgba(255, 255, 255, 0.5),
            inset 0 -0.1rem 0.3rem rgba(0, 0, 0, 0.8),
            inset 0 -0.4rem 0.9rem rgba(255, 255, 255, 0.4),
            0 3rem 3rem rgba(0, 0, 0, 0.3),
            0 1rem 1rem -0.6rem rgba(0, 0, 0, 0.8);
        }
        html:not(.dark) .pearl-button:active {
          box-shadow:
            inset 0 0.2rem 0.45rem rgba(255,255,255,1),
            inset 0 -0.08rem 0.25rem rgba(24,32,30,0.12),
            inset 0 -0.30rem 0.6rem rgba(24,32,30,0.08),
            0 1.2rem 2rem rgba(24,32,30,0.10),
            0 0.5rem 0.9rem -0.4rem rgba(24,32,30,0.14);
        }
        html.dark .pearl-button:active {
          box-shadow:
            inset 0 0.3rem 0.5rem rgba(255,255,255,0.45),
            inset 0 -0.1rem 0.3rem rgba(0,0,0,0.85),
            inset 0 -0.4rem 0.85rem rgba(255,255,255,0.38),
            0 0 0 1px rgba(184,217,107,0.10),
            0 3rem 3rem rgba(0,0,0,0.45),
            0 1rem 1rem -0.6rem rgba(0,0,0,0.9);
        }
      `}</style>

      <button className={`pearl-button ${className}`} {...props}>
        <div className="wrap">
          <p>
            <span>✧</span>
            <span>✦</span>
            {label}
          </p>
        </div>
      </button>
    </>
  );
};
