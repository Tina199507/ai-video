import React from 'react';
import { CheckCircle2, Music, ImageIcon, Mic, Film } from 'lucide-react';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { IconBox } from '../ui/IconBox';
import { StatusItem } from '../ui/StatusItem';
import { useLanguage } from '../../context/LanguageContext';

export const AuditPanel: React.FC = () => {
    const { t } = useLanguage();

    const auditItems = [
        { icon: <Music size={16} />, label: t('dash.audio_assets'), sub: t('dash.tracks_count'), status: 'check', color: 'green' },
        { icon: <ImageIcon size={16} />, label: t('dash.ref_images'), sub: t('dash.files_count'), status: 'check', color: 'green' },
        { icon: <Mic size={16} />, label: t('dash.voice_models'), sub: t('dash.trained_count'), status: 'alert', color: 'yellow' },
        { icon: <Film size={16} />, label: t('dash.stock_clips'), sub: t('dash.clips_count'), status: 'check', color: 'green' },
    ];

    return (
        <Card className="flex-1 flex flex-col" noPadding>
            <div className="p-6 border-b border-white/5 bg-zinc-900/30 flex justify-between items-center">
                <h3 className="font-bold text-white flex items-center gap-3 text-lg">
                    <IconBox icon={<CheckCircle2 size={18} />} color="green" size="sm" />
                    {t('dash.audit_title')}
                </h3>
                <Badge variant="success">{t('dash.ready')}</Badge>
            </div>
            <div className="p-6 grid grid-cols-1 gap-4">
                {auditItems.map((item, i) => (
                    <StatusItem 
                        key={i}
                        icon={item.icon}
                        label={item.label}
                        sub={item.sub}
                        status={item.status as any}
                        color={item.color as any}
                    />
                ))}
            </div>
        </Card>
    );
};
