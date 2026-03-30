import React from 'react';
import { CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';

interface StatusItemProps {
    icon: React.ReactNode;
    label: string;
    sub: string;
    status: 'check' | 'alert' | 'error';
    color: 'green' | 'yellow' | 'red';
}

export const StatusItem: React.FC<StatusItemProps> = ({
    icon,
    label,
    sub,
    status,
    color
}) => {
    const colorClasses = {
        green: 'bg-emerald-500/10 text-emerald-500 border-zinc-800',
        yellow: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
        red: 'bg-red-500/10 text-red-500 border-red-500/20'
    };

    return (
        <div className={`flex items-center justify-between p-3 bg-zinc-900/50 rounded-lg border ${colorClasses[color]} hover:bg-zinc-800/80 transition-colors`}>
            <div className="flex items-center gap-3">
                <div className={`p-2 rounded-md ${colorClasses[color]}`}>
                    {icon}
                </div>
                <div>
                    <div className="text-[10px] font-bold text-zinc-300 uppercase">{label}</div>
                    <div className="text-[9px] text-zinc-500 mt-0.5">{sub}</div>
                </div>
            </div>
            {status === 'check' && <CheckCircle2 size={14} className="text-emerald-500" />}
            {status === 'alert' && <AlertTriangle size={14} className="text-amber-500" />}
            {status === 'error' && <XCircle size={14} className="text-red-500" />}
        </div>
    );
};
