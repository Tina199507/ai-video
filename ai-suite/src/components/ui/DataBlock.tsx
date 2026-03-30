import React from 'react';

interface DataBlockProps {
    label: string;
    children: React.ReactNode;
}

export const DataBlock: React.FC<DataBlockProps> = ({ label, children }) => {
    return (
        <div className="space-y-2">
            <h4 className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">{label}</h4>
            <div>{children}</div>
        </div>
    );
};
