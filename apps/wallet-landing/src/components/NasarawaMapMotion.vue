<template>
  <div class="motion-map-container" aria-label="Interactive map showing 5 Nasarawa sites">
    <div class="map-header">
      <h3>Active Network Sites</h3>
      <span class="pulse-badge"><i class="dot"></i> Live · Nasarawa, NG</span>
    </div>

    <div class="svg-stage">
      <svg viewBox="0 0 400 300" xmlns="http://www.w3.org/2000/svg" class="nigeria-abstract-map">
        <!-- Tech Grid Background -->
        <defs>
          <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
            <path d="M 20 0 L 0 0 0 20" fill="none" stroke="currentColor" stroke-opacity="0.05" stroke-width="1"/>
          </pattern>
          <filter id="glow">
            <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
            <feMerge>
              <feMergeNode in="coloredBlur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>
        
        <rect width="100%" height="100%" fill="url(#grid)" />

        <!-- Abstract Nigeria Border Polygon -->
        <path class="nigeria-border" 
              d="M 60 140 L 90 70 L 170 50 L 260 60 L 320 110 L 300 220 L 220 280 L 140 270 L 80 220 Z" 
              fill="none" />

        <!-- Nasarawa Region Highlight -->
        <circle cx="210" cy="160" r="45" class="region-highlight" />

        <!-- Connecting Lines between the 5 sites -->
        <g class="network-lines">
          <!-- Central hub (Lafia) to others -->
          <line x1="210" y1="165" x2="185" y2="140" /> <!-- Lafia to Keffi -->
          <line x1="210" y1="165" x2="200" y2="125" /> <!-- Lafia to Akwanga -->
          <line x1="210" y1="165" x2="170" y2="155" /> <!-- Lafia to Karu -->
          <line x1="210" y1="165" x2="235" y2="150" /> <!-- Lafia to Nasarawa City -->
          
          <!-- Outer connections -->
          <line x1="185" y1="140" x2="170" y2="155" />
          <line x1="185" y1="140" x2="200" y2="125" />
          <line x1="200" y1="125" x2="235" y2="150" />
        </g>

        <!-- The 5 Sites -->
        <!-- 1. Lafia (Hub) -->
        <g class="site-node hub" transform="translate(210, 165)">
          <circle r="12" class="pulse-ring" />
          <circle r="4" class="node-core" />
          <text x="12" y="4" class="site-label">Lafia</text>
        </g>

        <!-- 2. Keffi -->
        <g class="site-node" transform="translate(185, 140)">
          <circle r="3" class="node-core" />
          <text x="-8" y="-8" class="site-label" text-anchor="end">Keffi</text>
        </g>

        <!-- 3. Akwanga -->
        <g class="site-node" transform="translate(200, 125)">
          <circle r="3" class="node-core" />
          <text x="0" y="-10" class="site-label" text-anchor="middle">Akwanga</text>
        </g>

        <!-- 4. Karu -->
        <g class="site-node" transform="translate(170, 155)">
          <circle r="3" class="node-core" />
          <text x="-8" y="4" class="site-label" text-anchor="end">Karu</text>
        </g>

        <!-- 5. Nasarawa City -->
        <g class="site-node" transform="translate(235, 150)">
          <circle r="3" class="node-core" />
          <text x="8" y="-2" class="site-label">Nasarawa</text>
        </g>
        
        <!-- Data Packets (Motion) -->
        <circle r="2" class="packet" fill="#fff">
          <animateMotion dur="2s" repeatCount="indefinite" path="M 210 165 L 185 140" />
        </circle>
        <circle r="2" class="packet" fill="#fff">
          <animateMotion dur="2.5s" repeatCount="indefinite" path="M 185 140 L 170 155" />
        </circle>
        <circle r="2" class="packet" fill="#fff">
          <animateMotion dur="1.8s" repeatCount="indefinite" path="M 210 165 L 235 150" />
        </circle>
        <circle r="2" class="packet" fill="#fff">
          <animateMotion dur="3s" repeatCount="indefinite" path="M 200 125 L 210 165" />
        </circle>
      </svg>
    </div>
  </div>
</template>

<script>
export default {
  name: "NasarawaMapMotion"
};
</script>

<style scoped>
.motion-map-container {
  display: flex;
  flex-direction: column;
  background: var(--surface-base, #1e293b);
  border-radius: var(--wallet-radius, 24px);
  border: 1px solid var(--border-color, #334155);
  overflow: hidden;
  box-shadow: inset 0 0 20px rgba(0, 0, 0, 0.2);
  color: var(--text-primary, #fff);
  position: relative;
}

.map-header {
  position: absolute;
  top: 16px;
  left: 20px;
  right: 20px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  z-index: 10;
}

.map-header h3 {
  margin: 0;
  font-size: 0.9rem;
  font-weight: 800;
  letter-spacing: -0.02em;
  color: #fff;
}

.pulse-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  padding: 4px 10px;
  background: rgba(234, 88, 12, 0.2);
  border: 1px solid rgba(234, 88, 12, 0.4);
  border-radius: 99px;
  color: #fdba74;
}

.pulse-badge .dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #f97316;
  animation: fastPulse 1.5s ease-in-out infinite;
}

.svg-stage {
  width: 100%;
  height: auto;
  aspect-ratio: 4/3;
  display: flex;
}

.nigeria-abstract-map {
  width: 100%;
  height: 100%;
  color: #334155; /* Grid color */
}

.nigeria-border {
  stroke: rgba(255, 255, 255, 0.15);
  stroke-width: 2;
  stroke-dasharray: 6 6;
  animation: dashMarch 20s linear infinite;
}

.region-highlight {
  fill: rgba(234, 88, 12, 0.05);
  stroke: rgba(234, 88, 12, 0.2);
  stroke-width: 1;
  animation: slowBreathe 4s ease-in-out infinite;
}

.network-lines line {
  stroke: rgba(234, 88, 12, 0.4);
  stroke-width: 1.5;
  stroke-linecap: round;
}

.site-node .node-core {
  fill: #f97316;
  filter: url(#glow);
}

.site-node.hub .node-core {
  fill: #fff;
  r: 5;
}

.pulse-ring {
  fill: none;
  stroke: #f97316;
  stroke-width: 2;
  animation: ringPulse 2s cubic-bezier(0.165, 0.84, 0.44, 1) infinite;
}

.site-label {
  fill: #fff;
  font-size: 8px;
  font-family: inherit;
  font-weight: 700;
  letter-spacing: 0.02em;
  opacity: 0.8;
  filter: drop-shadow(0 2px 2px rgba(0,0,0,0.8));
}

.packet {
  filter: url(#glow);
}

@keyframes dashMarch {
  to { stroke-dashoffset: -100; }
}

@keyframes slowBreathe {
  0%, 100% { transform: scale(1); opacity: 0.8; transform-origin: 210px 160px; }
  50% { transform: scale(1.05); opacity: 1; transform-origin: 210px 160px; }
}

@keyframes ringPulse {
  0% { r: 4; opacity: 1; stroke-width: 3; }
  100% { r: 24; opacity: 0; stroke-width: 0; }
}

@keyframes fastPulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.4; transform: scale(0.8); }
}
</style>
