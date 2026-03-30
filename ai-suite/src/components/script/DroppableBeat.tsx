import React from 'react';
import { useDraggable, useDroppable } from "@dnd-kit/core";

export const DroppableBeat = ({
  beat,
  index,
  isActive,
  isRelatedToFact,
  isDimmed,
  isEditing,
  children,
}: any) => {
  const { isOver, setNodeRef: setDroppableRef } = useDroppable({
    id: `beat-${index}`,
    data: { index },
  });

  const { attributes, listeners, setNodeRef: setDraggableRef, isDragging } = useDraggable({
    id: `beat-${index}`,
    data: { index },
    disabled: isEditing,
  });

  const combinedRef = (node: HTMLDivElement | null) => {
    setDroppableRef(node);
    setDraggableRef(node);
  };

  return (
    <div
      ref={combinedRef}
      {...attributes}
      {...listeners}
      className={`relative z-10 pl-10 group transition-all duration-300 ${isDimmed ? "opacity-40 grayscale-[0.5]" : "opacity-100"} ${isDragging ? "opacity-20 scale-95" : ""}`}
      style={{ cursor: isEditing ? "default" : "grab" }}
    >
      <div
        className={`absolute left-[26px] top-6 w-3 h-3 rounded-full border-2 border-[#131920] transition-colors z-20 ${isActive || isRelatedToFact ? "bg-blue-500 scale-125 shadow-[0_0_10px_#3b82f6]" : "bg-gray-600 group-hover:bg-blue-500"}`}
      ></div>
      <div
        className={`border p-4 rounded-lg transition-all cursor-pointer shadow-sm relative ${isActive ? "bg-blue-900/10 border-blue-500 shadow-[0_0_20px_rgba(59,130,246,0.15)] ring-1 ring-blue-500/30 translate-x-1" : ""} ${isRelatedToFact && !isActive ? "bg-blue-900/5 border-blue-500/40" : ""} ${!isActive && !isRelatedToFact ? "bg-card-dark border-gray-700 hover:border-gray-500 hover:shadow-md" : ""} ${isOver ? "ring-2 ring-emerald-500 bg-emerald-900/10" : ""}`}
      >
        {children}
      </div>
    </div>
  );
};
