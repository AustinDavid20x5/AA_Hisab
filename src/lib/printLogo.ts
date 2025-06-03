// Utility function to generate consistent logo HTML for print functionality
export function generatePrintLogoHTML(): string {
  return `
    <div class="print-logo-container">
      <div class="print-logo-icon">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-dollar-sign size-6 font-bold relative z-10 transition-all duration-500 group-hover:scale-125 group-hover:rotate-12 drop-shadow-lg">
          <line x1="12" x2="12" y1="2" y2="22"></line>
          <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
        </svg>
      </div>
      <div class="print-company-info">
        <div class="print-logo-title">FinTrack Pro</div>
        <div class="print-logo-subtitle">Financial Management</div>
      </div>
    </div>
  `;
}

// CSS styles for the print logo (to be included in print stylesheets)
export const printLogoCSS = `
  .print-logo-container {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .print-logo-icon {
    width: 40px;
    height: 40px;
    background: linear-gradient(135deg, #4ade80 0%, #10b981 50%, #22c55e 100%) !important;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    -webkit-print-color-adjust: exact !important;
    box-shadow: 0 8px 25px rgba(34, 197, 94, 0.3) !important;
    border: 1px solid rgba(74, 222, 128, 0.2) !important;
  }
  .print-logo-icon svg {
    color: white !important;
    stroke: white !important;
    fill: none !important;
    font-weight: bold;
  }
  .print-company-info {
    display: flex;
    flex-direction: column;
  }
  .print-logo-title {
    font-size: 14px;
    font-weight: bold;
    color: #000 !important;
    margin: 0;
    line-height: 1.2;
  }
  .print-logo-subtitle {
    font-size: 8px;
    color: #666 !important;
    margin: 0;
    line-height: 1.2;
  }
`;