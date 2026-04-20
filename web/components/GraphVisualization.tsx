'use client';

import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';

interface Node extends d3.SimulationNodeDatum {
  id:    string;
  label: string;
  type:  string;
}

interface Link extends d3.SimulationLinkDatum<Node> {
  id:   string;
  type: string;
}

interface GraphProps {
  data: {
    nodes: Node[];
    links: Link[];
  };
}

export default function GraphVisualization({ data }: GraphProps) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current || !data.nodes.length) return;

    const width  = 800;
    const height = 600;

    const svg = d3.select(svgRef.current)
      .attr('viewBox', [0, 0, width, height] as any)
      .attr('style', 'max-width: 100%; height: auto;');

    svg.selectAll('*').remove(); // Clear existing

    const simulation = d3.forceSimulation(data.nodes)
      .force('link', d3.forceLink(data.links).id((d: any) => d.id).distance(100))
      .force('charge', d3.forceManyBody().strength(-300))
      .force('center', d3.forceCenter(width / 2, height / 2));

    const link = svg.append('g')
      .attr('stroke', '#999')
      .attr('stroke-opacity', 0.6)
      .selectAll('line')
      .data(data.links)
      .join('line')
      .attr('stroke-width', 2);

    const node = svg.append('g')
      .attr('stroke', '#fff')
      .attr('stroke-width', 1.5)
      .selectAll('circle')
      .data(data.nodes)
      .join('circle')
      .attr('r', 8)
      .attr('fill', (d: any) => getColor(d.type))
      .call(drag(simulation) as any);

    node.append('title')
      .text((d: any) => `${d.label} (${d.type})`);

    const labels = svg.append('g')
      .selectAll('text')
      .data(data.nodes)
      .join('text')
      .attr('dx', 12)
      .attr('dy', '.35em')
      .text((d: any) => d.label)
      .style('font-size', '12px')
      .style('fill', '#666');

    simulation.on('tick', () => {
      link
        .attr('x1', (d: any) => d.source.x)
        .attr('y1', (d: any) => d.source.y)
        .attr('x2', (d: any) => d.target.x)
        .attr('y2', (d: any) => d.target.y);

      node
        .attr('cx', (d: any) => d.x)
        .attr('cy', (d: any) => d.y);

      labels
        .attr('x', (d: any) => d.x)
        .attr('y', (d: any) => d.y);
    });

    function getColor(type: string) {
      const colors: Record<string, string> = {
        Person: '#ff7f0e',
        Organization: '#1f77b4',
        Technology: '#2ca02c',
        Concept: '#9467bd',
        Metric: '#d62728',
        Constraint: '#8c564b',
      };
      return colors[type] || '#7f7f7f';
    }

    function drag(sim: any) {
      function dragstarted(event: any) {
        if (!event.active) sim.alphaTarget(0.3).restart();
        event.subject.fx = event.subject.x;
        event.subject.fy = event.subject.y;
      }
      function dragged(event: any) {
        event.subject.fx = event.x;
        event.subject.fy = event.y;
      }
      function dragended(event: any) {
        if (!event.active) sim.alphaTarget(0);
        event.subject.fx = null;
        event.subject.fy = null;
      }
      return d3.drag()
        .on('start', dragstarted)
        .on('drag', dragged)
        .on('end', dragended);
    }
  }, [data]);

  return (
    <div className="border border-gray-200 rounded-lg p-4 bg-white shadow-sm overflow-hidden">
      <svg ref={svgRef}></svg>
    </div>
  );
}
