import { useState } from 'react';
import { Plus } from 'lucide-react';
import { faq } from '../researchStory';
import styles from '../Website4TestPage.module.css';

export function Faq() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <div className={styles.faqList}>
      {faq.map((item, index) => {
        const isOpen = open === index;
        return (
          <div key={item.q} className={styles.faqItem} data-open={isOpen || undefined}>
            <h3>
              <button
                type="button"
                id={`w4-faq-${index}`}
                aria-expanded={isOpen}
                aria-controls={`w4-faq-panel-${index}`}
                onClick={() => setOpen(isOpen ? null : index)}
              >
                {item.q}
                <Plus size={18} strokeWidth={1.7} aria-hidden="true" />
              </button>
            </h3>
            <div id={`w4-faq-panel-${index}`} className={styles.faqPanel} role="region" aria-labelledby={`w4-faq-${index}`} aria-hidden={!isOpen}>
              <div><p>{item.a}</p></div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
