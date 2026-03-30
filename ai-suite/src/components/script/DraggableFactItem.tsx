import React from 'react';
import { useDraggable } from "@dnd-kit/core";
import { FactItem } from "./FactItem";

export const DraggableFactItem = (props: any) => {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `fact-${props.index}`,
    data: { index: props.index },
  });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={{ opacity: isDragging ? 0.5 : 1, cursor: "grab" }}
    >
      <FactItem {...props} />
    </div>
  );
};
