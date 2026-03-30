import React from 'react';
import { AlertTriangle, ShieldAlert, Lock } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';

interface SafetyAlertsProps {
    requiresManualCorrection: boolean;
    safetyMetadata: any;
    highRiskApproved: boolean;
    onApproveChange: (approved: boolean) => void;
    safetyCheckboxRef: React.RefObject<HTMLDivElement>;
}

export const SafetyAlerts: React.FC<SafetyAlertsProps> = ({
    requiresManualCorrection,
    safetyMetadata,
    highRiskApproved,
    onApproveChange,
    safetyCheckboxRef
}) => {
    const { t } = useLanguage();

    if (!requiresManualCorrection && !safetyMetadata?.isHighRisk) return null;

    return (
        <div className="flex flex-col gap-3 mb-8">
            {requiresManualCorrection && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 flex items-center gap-4">
                    <AlertTriangle size={20} className="text-red-500 shrink-0" />
                    <div className="flex flex-col">
                        <span className="text-sm font-bold text-red-400 uppercase tracking-wider">
                            {t("script.manual_correction_required")}
                        </span>
                        <span className="text-xs text-zinc-400">
                            {t("script.duration_deviation_warning")}
                        </span>
                    </div>
                </div>
            )}

            {safetyMetadata?.isHighRisk && (
                <div className="bg-orange-500/10 border border-orange-500/20 rounded-lg p-4 flex flex-col gap-3">
                    <div className="flex items-start gap-4">
                        <ShieldAlert size={20} className="text-orange-500 shrink-0 mt-0.5" />
                        <div className="flex flex-col overflow-hidden">
                            <span className="text-sm font-bold text-orange-400 uppercase tracking-wider">
                                {t("script.high_risk_content")}
                            </span>
                            <span className="text-xs text-zinc-400">
                                {safetyMetadata.triggerWarning || t("script.default_trigger_warning")}
                            </span>
                            <div className="flex flex-wrap gap-1.5 mt-2">
                                {safetyMetadata.riskCategories?.map((cat: string) => (
                                    <span
                                        key={cat}
                                        className="text-[10px] bg-orange-500/20 text-orange-300 px-2 py-0.5 rounded border border-orange-500/20 uppercase font-bold"
                                    >
                                        {cat}
                                    </span>
                                ))}
                            </div>
                        </div>
                    </div>
                    <label 
                        ref={safetyCheckboxRef}
                        className="flex items-center gap-3 cursor-pointer group bg-orange-500/5 hover:bg-orange-500/10 p-3 rounded border border-orange-500/10 transition-all"
                    >
                        <input
                            type="checkbox"
                            checked={highRiskApproved}
                            onChange={(e) => onApproveChange(e.target.checked)}
                            className="w-4 h-4 rounded border-zinc-700 bg-zinc-800 text-primary focus:ring-primary"
                        />
                        <span className="text-xs text-zinc-400 group-hover:text-zinc-200 transition-colors uppercase font-bold tracking-tight">
                            {t("script.approve_high_risk")}
                        </span>
                    </label>
                </div>
            )}
        </div>
    );
};
