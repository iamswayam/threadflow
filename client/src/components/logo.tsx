export function ThreadFlowLogo({ className = "w-8 h-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="tfGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#2dd4bf" />
          <stop offset="100%" stopColor="#0891b2" />
        </linearGradient>
      </defs>
      <path
        d="M20 6C12.268 6 6 12.268 6 20C6 27.732 12.268 34 20 34C24.8 34 28 31.8 28 31.8"
        stroke="url(#tfGrad)" strokeWidth="3.2" strokeLinecap="round" fill="none"
      />
      <path
        d="M28 12C28 12 31 15 31 20C31 25 28 28 28 28"
        stroke="url(#tfGrad)" strokeWidth="3.2" strokeLinecap="round" fill="none"
      />
      <circle cx="20" cy="20" r="5.5" fill="url(#tfGrad)" />
      <path
        d="M20 14.5C20 14.5 28 14.5 28 20"
        stroke="url(#tfGrad)" strokeWidth="3.2" strokeLinecap="round" fill="none"
      />
    </svg>
  );
}

export function ThreadFlowLogoSquare({ className = "w-8 h-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="40" height="40" rx="10" fill="url(#tfBg)" />
      <defs>
        <linearGradient id="tfBg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#0f766e" />
          <stop offset="100%" stopColor="#0e7490" />
        </linearGradient>
        <linearGradient id="tfGrad2" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#e0f7f7" />
        </linearGradient>
      </defs>
      <path
        d="M20 9C13.373 9 8 14.373 8 21C8 27.627 13.373 33 20 33C24.4 33 27 31.2 27 31.2"
        stroke="url(#tfGrad2)" strokeWidth="2.8" strokeLinecap="round" fill="none"
      />
      <path
        d="M27 13C27 13 30 15.8 30 21C30 26.2 27 29 27 29"
        stroke="url(#tfGrad2)" strokeWidth="2.8" strokeLinecap="round" fill="none"
      />
      <circle cx="20" cy="21" r="4.5" fill="url(#tfGrad2)" />
      <path
        d="M20 16.5C20 16.5 27 16.5 27 21"
        stroke="url(#tfGrad2)" strokeWidth="2.8" strokeLinecap="round" fill="none"
      />
    </svg>
  );
}
