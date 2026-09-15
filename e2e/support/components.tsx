import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Tabs } from '../../src/components/ui/Tabs';
import { SearchResults } from '../../src/features/ui/SearchResults';
import '../../src/styles/design-system.css';

function ComponentFixture() {
    const [selected, setSelected] = useState('one');
    const [searchOpen, setSearchOpen] = useState(false);
    return <main>
        <Tabs aria-label="Test sections" value={selected} onChange={setSelected}
            items={[{ id: 'one', label: 'First' }, { id: 'disabled', label: 'Unavailable', disabled: true }, { id: 'two', label: 'Second' }]} />
        <output aria-label="Selected section">{selected}</output>
        <button onClick={() => setSearchOpen(!searchOpen)}>{searchOpen ? 'Close search' : 'Open search'}</button>
        {searchOpen && <SearchResults query="qa fixture" onClose={() => setSearchOpen(false)} />}
    </main>;
}

createRoot(document.getElementById('component-root')!).render(<ComponentFixture />);
