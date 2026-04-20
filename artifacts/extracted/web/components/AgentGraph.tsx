React

'use client';

import { useEffect, useMemo, useRef } from 'react';
import * as d3 from 'd3';

interface GraphNode {
  node_id: string;
  label: string;
  node_type: string;
  properties_json?: string;
}

interface GraphEdge {
  id: string;
  from_node_id: string;
  to_node_id: string;
  rel_type: string;
  weight: number;
}

interface AgentGraphProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  width?: number;
  height?: number;
  onNodeClick?: (nodeId: string) => void;
}

const NODE_COLORS: Record<string, string> = {
  Entity: '#22d3ee',
  Concept: '#a78bfa',
  Claim: '#4ade80',
  Constraint: '#f87171',
  Metric: '#facc15',
  Evidence: '#fb923c',
  Artifact: '#94a3b8',
};

export function AgentGraph({
  nodes,
  edges,
  width = 900,
  height = 520,
  onNodeClick,
}: AgentGraphProps) {
  const ref = useRef<SVGSVGElement>(null);

  const graph = useMemo(() => ({
    nodes: nodes.map(n => ({ ...n })),
    links: edges.map(e => ({ ...e })),
  }), [nodes, edges]);

  useEffect(() => {
    if (!ref.current) return;

    const svg = d3.select(ref.current);
    svg.selectAll('*').remove();

    const root = svg
      .attr('viewBox', `0 0 ${width} ${height}`)
      .style('background', '#0a0f1a');

    const g = root.append('g');

    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.2, 4])
      .on('zoom', (event) => {
        g.attr('transform', event.transform);
      });

    root.call(zoom as any);

    const simulation = d3.forceSimulation(graph.nodes as any)
      .force('link', d3.forceLink(graph.links as any)
        .id((d: any) => d.node_id)
        .distance((d: any) => 80 + (1 - (d.weight ?? 0.7)) * 70)
      )
      .force('charge', d3.forceManyBody().strength(-180))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collide', d3.forceCollide(18));

    const link = g.append('g')
      .attr('stroke', '#334155')
      .attr('stroke-opacity', 0.7)
      .selectAll('line')
      .data(graph.links)
      .enter()
      .append('line')
      .attr('stroke-width', (d: any) => Math.max(1, (d.weight ?? 0.7) * 2.5));

    const linkLabels = g.append('g')
      .selectAll('text')
      .data(graph.links)
      .enter()
      .append('text')
      .text((d: any) => d.rel_type)
      .attr('font-size', 9)
      .attr('fill', '#64748b')
      .attr('text-anchor', 'middle');

    const node = g.append('g')
      .selectAll('circle')
      .data(graph.nodes)
      .enter()
      .append('circle')
      .attr('r', 10)
      .attr('fill', (d: any) => NODE_COLORS[d.node_type] ?? '#94a3b8')
      .attr('stroke', '#e2e8f0')
      .attr('stroke-width', 1)
      .style('cursor', 'pointer')
      .on('click', (_event, d: any) => onNodeClick?.(d.node_id))
      .call(d3.drag<any, any>()
        .on('start', (event, d: any) => {
          if (!event.active) simulation.alphaTarget(0.3).restart();
          d.fx = d.x;
          d.fy = d.y;
        })
        .on('drag', (_event, d: any) => {
          d.fx = _event.x;
          d.fy = _event.y;
        })
        .on('end', (event, d: any) => {
          if (!event.active) simulation.alphaTarget(0);
          d.fx = null;
          d.fy = null;
        }) as any
      );

    const labels = g.append('g')
      .selectAll('text')
      .data(graph.nodes)
      .enter()
      .append('text')
      .text((d: any) => d.label.length > 28 ? `${d.label.slice(0, 28)}…` : d.label)
      .attr('font-size', 11)
      .attr('fill', '#e2e8f0')
      .attr('dx', 14)
      .attr('dy', 4)
      .style('pointer-events', 'none');

    simulation.on('tick', () => {
      link
        .attr('x1', (d: any) => d.source.x)
        .attr('y1', (d: any) => d.source.y)
        .attr('x2', (d: any) => d.target.x)
        .attr('y2', (d: any) => d.target.y);

      linkLabels
        .attr('x', (d: any) => (d.source.x + d.target.x) / 2)
        .attr('y', (d: any) => (d.source.y + d.target.y) / 2);

      node
        .attr('cx', (d: any) => d.x)
        .attr('cy', (d: any) => d.y);

      labels
        .attr('x', (d: any) => d.x)
        .attr('y', (d: any) => d.y);
    });

    return () => {
      simulation.stop();
    };
  }, [graph, width, height, onNodeClick]);

  return (
    <div className="bg-gray-900 rounded-lg p-4 border border-gray-800">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-gray-400">Knowledge Graph</h3>
        <div className="text-xs text-gray-600">
          {nodes.length} nodes · {edges.length} edges
        </div>
      </div>
      <svg ref={ref} className="w-full rounded border border-gray-800" />
      <div className="mt-3 flex flex-wrap gap-3 text-xs text-gray-500">
        {Object.entries(NODE_COLORS).map(([type, color]) => (
          <div key={type} className="flex items-center gap-1">
            <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: color }} />
            <span>{type}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
15. Add graph dashboard page