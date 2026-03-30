import React from 'react';
import { ConstraintCompliance } from '../../types';

interface ConstraintComplianceBarProps {
  compliance: ConstraintCompliance;
  targetMetaphorCount?: number;
  targetInteractionCues?: number;
}

export const ConstraintComplianceBar: React.FC<ConstraintComplianceBarProps> = ({ 
  compliance, 
  targetMetaphorCount = 5, 
  targetInteractionCues = 1 
}) => {
  const items = [
    {
      label: "超出绝对句长限制",
      value: compliance.sentences_exceeding_absolute_limit,
      pass: compliance.sentences_exceeding_absolute_limit === 0,
      format: (v: number) => `${v}句`
    },
    {
      label: "类比数量",
      value: compliance.metaphor_count,
      pass: compliance.metaphor_count === targetMetaphorCount,
      format: (v: number) => `${v}/${targetMetaphorCount}个`
    },
    {
      label: "互动引导",
      value: compliance.interaction_cues_count,
      pass: compliance.interaction_cues_count === targetInteractionCues,
      format: (v: number) => `${v}句`
    },
    {
      label: "总字数",
      value: compliance.total_length,
      pass: compliance.within_target_range,
      format: () => compliance.within_target_range ? "达标" : "超出范围"
    }
  ];

  return (
    <div className="flex gap-3 px-4 py-2 bg-[#0a0a0a] border-t border-white/5 overflow-x-auto">
      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-1 text-xs whitespace-nowrap">
          <span className={item.pass ? "text-green-400" : "text-orange-400"}>
            {item.pass ? "✓" : "⚠"}
          </span>
          <span className="text-white/40">{item.label}:</span>
          <span className={item.pass ? "text-green-300" : "text-orange-300"}>
            {item.format(item.value as number)}
          </span>
        </div>
      ))}
    </div>
  );
};
