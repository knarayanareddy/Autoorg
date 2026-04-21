'use client';

import { useEffect, useRef } from 'react';
import * as d3 from 'd3';

interface ScorePoint {
  cycle_number: number;
  composite:    number;
  decision:     string;
}

interface ScoreChartProps {
  data:   ScorePoint[];
  width?: number;
  height?: number;
}

export function ScoreChart({ data, width = 600, height = 180 }: ScoreChartProps) {
  const ref = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!ref.current || data.length === 0) return;

    const svg    = d3.select(ref.current);
    const margin = { top: 16, right: 16, bottom: 32, left: 48 };
    const W      = width  - margin.left - margin.right;
    const H      = height - margin.top  - margin.bottom;

    svg.selectAll('*').remove();

    // --- High-Fidelity Filters ---
    const defs = svg.append('defs');
    
    // Neon Glow Filter
    const glow = defs.append('filter')
      .attr('id', 'neonGlow')
      .attr('x', '-20%').attr('y', '-20%')
      .attr('width', '140%').attr('height', '140%');
    
    glow.append('feGaussianBlur')
      .attr('stdDeviation', '3')
      .attr('result', 'blur');
    
    glow.append('feComposite')
      .attr('in', 'SourceGraphic')
      .attr('in2', 'blur')
      .attr('operator', 'over');

    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    // Scales
    const xScale = d3.scaleLinear()
      .domain([1, Math.max(data.length, 10)])
      .range([0, W]);

    const yScale = d3.scaleLinear()
      .domain([0, 1])
      .range([H, 0]);

    // Grid lines
    g.append('g')
      .attr('class', 'grid')
      .selectAll('line')
      .data([0.25, 0.5, 0.75, 1.0])
      .enter().append('line')
      .attr('x1', 0).attr('x2', W)
      .attr('y1', (d: number) => yScale(d)).attr('y2', (d: number) => yScale(d))
      .attr('stroke', '#1f2937').attr('stroke-dasharray', '4,4');

    // Dynamic Ratchet Line (Previous Best)
    const bestSoFar = data.length > 1 ? Math.max(...data.slice(0, -1).map(d => d.composite)) : 0;
    if (bestSoFar > 0) {
      g.append('line')
        .attr('x1', 0).attr('x2', W)
        .attr('y1', yScale(bestSoFar)).attr('y2', yScale(bestSoFar))
        .attr('stroke', '#facc15').attr('stroke-dasharray', '2,4').attr('opacity', 0.5);
      
      g.append('text')
        .attr('x', 4).attr('y', yScale(bestSoFar) - 4)
        .attr('fill', '#facc15').attr('font-size', '8px').attr('opacity', 0.8)
        .text(`ratchet: ${(bestSoFar * 100).toFixed(1)}%`);
    }

    // Target score line (Enterprise-tier)
    g.append('line')
      .attr('x1', 0).attr('x2', W)
      .attr('y1', yScale(0.85)).attr('y2', yScale(0.85))
      .attr('stroke', '#22d3ee').attr('stroke-dasharray', '8,4').attr('opacity', 0.4);

    // Area fill
    const area = d3.area<ScorePoint>()
      .x((d: ScorePoint)  => xScale(d.cycle_number))
      .y0(H)
      .y1((d: ScorePoint) => yScale(d.composite))
      .curve(d3.curveMonotoneX);

    const gradient = defs.append('linearGradient')
      .attr('id', 'scoreGradient').attr('x1', '0%').attr('y1', '0%').attr('x2', '0%').attr('y2', '100%');
    gradient.append('stop').attr('offset', '0%').attr('stop-color', '#22d3ee').attr('stop-opacity', 0.3);
    gradient.append('stop').attr('offset', '100%').attr('stop-color', '#22d3ee').attr('stop-opacity', 0);

    g.append('path')
      .datum(data)
      .attr('fill', 'url(#scoreGradient)')
      .attr('d', area);

    // Line with Glow
    const line = d3.line<ScorePoint>()
      .x((d: ScorePoint) => xScale(d.cycle_number))
      .y((d: ScorePoint) => yScale(d.composite))
      .curve(d3.curveMonotoneX);

    g.append('path')
      .datum(data)
      .attr('fill', 'none')
      .attr('stroke', '#22d3ee')
      .attr('stroke-width', 3)
      .attr('filter', 'url(#neonGlow)')
      .attr('d', line);

    // Pulse Animation
    const pulse = () => {
      g.selectAll('.dot-pulse')
        .transition().duration(1000)
        .attr('r', 8).attr('opacity', 0)
        .transition().duration(0)
        .attr('r', 4).attr('opacity', 0.4)
        .on('end', pulse);
    };

    // Dots — color by decision
    const dots = g.selectAll('.dot-group')
      .data(data)
      .enter().append('g')
      .attr('class', 'dot-group');

    dots.append('circle')
      .attr('cx', (d: ScorePoint) => xScale(d.cycle_number))
      .attr('cy', (d: ScorePoint) => yScale(d.composite))
      .attr('r', 4)
      .attr('fill', (d: ScorePoint) => d.decision === 'COMMIT' ? '#4ade80' : '#f87171')
      .attr('filter', 'url(#neonGlow)');

    // X axis
    g.append('g')
      .attr('transform', `translate(0,${H})`)
      .call(d3.axisBottom(xScale).ticks(Math.min(data.length, 10)).tickFormat((d: any) => `C${d}`))
      .attr('color', '#4b5563')
      .selectAll('text').attr('font-size', '10px');

    // Y axis
    g.append('g')
      .call(d3.axisLeft(yScale).ticks(5).tickFormat((d: any) => `${(+d * 100).toFixed(0)}%`))
      .attr('color', '#4b5563')
      .selectAll('text').attr('font-size', '10px');

  }, [data, width, height]);

  return (
    <div className="bg-gray-900 rounded-lg p-4 border border-gray-800">
      <h3 className="text-sm font-bold text-gray-400 mb-3">Score History</h3>
      {data.length === 0
        ? <div className="text-gray-600 text-sm text-center py-8">Waiting for cycles...</div>
        : <svg ref={ref} width={width} height={height} className="w-full" />
      }
    </div>
  );
}
