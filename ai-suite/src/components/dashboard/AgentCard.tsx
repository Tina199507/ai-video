import React from 'react';
import { Badge } from '../ui/Badge';

interface AgentCardProps {
    title: string;
    description: string;
    icon: React.ReactNode;
    color: 'emerald' | 'blue' | 'purple';
    badgeText?: string;
    children: React.ReactNode;
}

export const AgentCard: React.FC<AgentCardProps> = ({
    title,
    description,
    icon,
    color,
    badgeText,
    children
}) => {
    const colorClasses = {
        emerald: {
            container: 'agent-card-emerald',
            iconBox: 'bg-emerald-500/20 text-emerald-500',
            title: 'text-emerald-100',
            desc: 'text-emerald-400/60',
            badge: 'bg-emerald-500/20 text-emerald-400 border-none'
        },
        blue: {
            container: 'agent-card-blue',
            iconBox: 'bg-blue-500/20 text-blue-500',
            title: 'text-blue-100',
            desc: 'text-blue-400/60',
            badge: 'bg-blue-500/20 text-blue-400 border-none'
        },
        purple: {
            container: 'agent-card-purple',
            iconBox: 'bg-purple-500/20 text-purple-500',
            title: 'text-purple-100',
            desc: 'text-purple-400/60',
            badge: 'bg-purple-500/20 text-purple-400 border-none'
        }
    };

    const styles = colorClasses[color];

    return (
        <div className={`agent-card-container ${styles.container}`}>
            <div className="flex items-start justify-between mb-4">
                <div className="flex gap-3">
                    <div className={`agent-icon-box ${styles.iconBox}`}>{icon}</div>
                    <div>
                        <h4 className={`text-xs font-bold uppercase tracking-wide ${styles.title}`}>{title}</h4>
                        <p className={`text-[10px] mt-0.5 ${styles.desc}`}>{description}</p>
                    </div>
                </div>
                {badgeText && (
                    <Badge variant="success" className={styles.badge}>{badgeText}</Badge>
                )}
            </div>
            {children}
        </div>
    );
};
