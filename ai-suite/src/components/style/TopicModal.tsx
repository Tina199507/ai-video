import React from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { BookOpen } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';

interface TopicModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: () => void;
    topicInput: string;
    onTopicInputChange: (value: string) => void;
}

export const TopicModal: React.FC<TopicModalProps> = ({
    isOpen,
    onClose,
    onSubmit,
    topicInput,
    onTopicInputChange
}) => {
    const { t } = useLanguage();

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={<span className="flex items-center gap-2"><BookOpen className="text-primary w-5 h-5" />{t('style.enter_topic')}</span>}
            footer={
                <div className="flex justify-end gap-2 w-full">
                    <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
                    <Button variant="primary" onClick={onSubmit} disabled={!topicInput.trim()}>{t('common.continue')}</Button>
                </div>
            }
        >
            <div className="p-6">
                <p className="text-sm text-zinc-400 mb-4">{t('style.topic_prompt')}</p>
                <input 
                    type="text" 
                    value={topicInput} 
                    onChange={(e) => onTopicInputChange(e.target.value)}
                    placeholder={t('style.topic_placeholder')}
                    className="w-full bg-black/50 border border-zinc-700 rounded-lg p-3 text-white focus:border-primary focus:outline-none"
                    autoFocus
                    onKeyDown={(e) => e.key === 'Enter' && onSubmit()}
                />
            </div>
        </Modal>
    );
};
