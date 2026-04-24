import React, { useEffect, useRef, useState } from 'react';
import ForceGraph2D from 'react-force-graph-2d';

interface Node {
  id: string;
  name: string;
  val: number;
  color?: string;
}

interface Link {
  source: string;
  target: string;
}

interface GraphData {
  nodes: Node[];
  links: Link[];
}

interface GraphViewProps {
  data: GraphData;
}

export const GraphView: React.FC<GraphViewProps> = ({ data }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  useEffect(() => {
    if (containerRef.current) {
      const { clientWidth, clientHeight } = containerRef.current;
      setDimensions({ width: clientWidth, height: clientHeight });
    }

    const handleResize = () => {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        });
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <div ref={containerRef} className="w-full h-full bg-[#0c0d10] rounded-lg overflow-hidden relative border border-[#1e2128] shadow-2xl">
      <div className="absolute top-4 left-4 z-10 bg-[#151619]/90 backdrop-blur-sm border border-[#2b2d35] px-3 py-1.5 rounded text-[10px] uppercase font-mono tracking-widest text-[#9ca3af]">
        Topological Analysis View
      </div>
      {dimensions.width > 0 && (
        <ForceGraph2D
          graphData={data}
          width={dimensions.width}
          height={dimensions.height}
          nodeLabel="name"
          nodeColor={(node: any) => node.color || '#6366f1'}
          linkColor={() => '#2b2d35'}
          nodeRelSize={6}
          backgroundColor="transparent"
          onNodeClick={(node: any) => {
             console.log('Clicked node:', node);
          }}
        />
      )}
    </div>
  );
};
