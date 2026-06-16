document.addEventListener('DOMContentLoaded', () => {
    // State management
    let state = {
        notes: [],
        filteredNotes: [],
        searchQuery: '',
        activeCategory: 'ALL',
        loading: false,
        lastUpdated: null
    };

    // DOM Elements
    const elements = {
        notesContainer: document.getElementById('notes-container'),
        searchInput: document.getElementById('search-input'),
        filterContainer: document.getElementById('filter-container'),
        refreshBtn: document.getElementById('refresh-btn'),
        refreshIcon: document.getElementById('refresh-icon'),
        lastUpdatedText: document.getElementById('last-updated-text'),
        totalNotesCount: document.getElementById('total-notes-count'),
        filteredNotesCount: document.getElementById('filtered-notes-count'),
        
        // Tweet Modal Elements
        tweetModal: document.getElementById('tweet-modal'),
        tweetTextarea: document.getElementById('tweet-textarea'),
        charCounter: document.getElementById('char-counter'),
        closeModalBtn: document.getElementById('close-modal'),
        cancelTweetBtn: document.getElementById('cancel-tweet'),
        submitTweetBtn: document.getElementById('submit-tweet'),
        copyTweetBtn: document.getElementById('copy-tweet'),
        
        // Toast Notification
        toast: document.getElementById('toast'),
        toastMessage: document.getElementById('toast-message')
    };

    // Category style mapping
    const CATEGORIES = {
        'FEATURE': {
            label: 'Feature',
            accent: '#10b981',
            badgeBg: 'rgba(16, 185, 129, 0.1)',
            badgeColor: '#10b981'
        },
        'ISSUE': {
            label: 'Issue / Fix',
            accent: '#ef4444',
            badgeBg: 'rgba(239, 68, 68, 0.1)',
            badgeColor: '#ef4444'
        },
        'CHANGE': {
            label: 'Change',
            accent: '#f59e0b',
            badgeBg: 'rgba(245, 158, 11, 0.1)',
            badgeColor: '#f59e0b'
        },
        'DEPRECATION': {
            label: 'Deprecation',
            accent: '#ec4899',
            badgeBg: 'rgba(236, 72, 153, 0.1)',
            badgeColor: '#ec4899'
        },
        'ANNOUNCEMENT': {
            label: 'Announcement',
            accent: '#3b82f6',
            badgeBg: 'rgba(59, 130, 246, 0.1)',
            badgeColor: '#3b82f6'
        }
    };

    const DEFAULT_CATEGORY_STYLE = {
        label: 'Notice',
        accent: '#8b5cf6',
        badgeBg: 'rgba(139, 92, 246, 0.1)',
        badgeColor: '#8b5cf6'
    };

    // Helper: Get style configuration for a category
    function getCategoryStyle(type) {
        if (!type) return DEFAULT_CATEGORY_STYLE;
        const normalized = type.toUpperCase().trim();
        return CATEGORIES[normalized] || {
            label: type,
            accent: '#8b5cf6',
            badgeBg: 'rgba(139, 92, 246, 0.1)',
            badgeColor: '#8b5cf6'
        };
    }

    // Helper: Toast alerts
    function showToast(message, isError = false) {
        elements.toastMessage.textContent = message;
        if (isError) {
            elements.toast.classList.add('error');
        } else {
            elements.toast.classList.remove('error');
        }
        elements.toast.classList.add('active');
        
        setTimeout(() => {
            elements.toast.classList.remove('active');
        }, 3500);
    }

    // Render Skeletons for Loading State
    function renderSkeletons() {
        elements.notesContainer.innerHTML = '';
        for (let i = 0; i < 6; i++) {
            const skeleton = document.createElement('div');
            skeleton.className = 'skeleton-card';
            skeleton.innerHTML = `
                <div class="skeleton-header">
                    <div class="skeleton-badge"></div>
                    <div class="skeleton-date"></div>
                </div>
                <div>
                    <div class="skeleton-line" style="width: 90%;"></div>
                    <div class="skeleton-line" style="width: 95%;"></div>
                    <div class="skeleton-line" style="width: 80%;"></div>
                </div>
                <div class="skeleton-footer">
                    <div class="skeleton-badge" style="width: 60px;"></div>
                    <div class="skeleton-btn"></div>
                </div>
            `;
            elements.notesContainer.appendChild(skeleton);
        }
    }

    // Fetch release notes from API
    async function fetchReleaseNotes(forceRefresh = false) {
        if (state.loading) return;
        
        state.loading = true;
        elements.refreshBtn.disabled = true;
        elements.refreshIcon.classList.add('spinner');
        renderSkeletons();

        try {
            const response = await fetch(`/api/release-notes?refresh=${forceRefresh}`);
            if (!response.ok) throw new Error('Failed to fetch release notes from server');
            
            const data = await response.json();
            
            if (data.status === 'success') {
                state.notes = data.notes;
                state.lastUpdated = data.last_updated;
                
                // Format last updated date
                const date = new Date(state.lastUpdated * 1000);
                elements.lastUpdatedText.textContent = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' ' + date.toLocaleDateString();
                
                // Update total stats
                elements.totalNotesCount.textContent = state.notes.length;
                
                // Regenerate category filter buttons dynamically
                buildCategoryFilters();
                
                // Apply current filters & render
                applyFiltersAndSearch();

                if (forceRefresh) {
                    showToast('Release notes successfully refreshed!');
                }
            } else {
                throw new Error(data.message || 'Unknown server error');
            }
        } catch (error) {
            console.error('Error loading release notes:', error);
            showToast(error.message || 'Error connecting to the server', true);
            // Clear skeleton load
            elements.notesContainer.innerHTML = `
                <div class="no-results">
                    <div class="no-results-icon">⚠️</div>
                    <h3>Failed to load release notes</h3>
                    <p>${error.message || 'Please check your connection and try again.'}</p>
                    <button class="btn btn-primary" id="retry-btn" style="margin-top: 1rem;">Retry Fetch</button>
                </div>
            `;
            const retryBtn = document.getElementById('retry-btn');
            if (retryBtn) {
                retryBtn.addEventListener('click', () => fetchReleaseNotes(true));
            }
        } finally {
            state.loading = false;
            elements.refreshBtn.disabled = false;
            elements.refreshIcon.classList.remove('spinner');
        }
    }

    // Dynamically build filter chips based on categories found in the notes
    function buildCategoryFilters() {
        // Collect all categories
        const categories = new Set();
        state.notes.forEach(note => {
            if (note.type) {
                categories.add(note.type.trim());
            }
        });

        // Clear existing, keep "All"
        elements.filterContainer.innerHTML = '';
        
        // Add "All" chip
        const allChip = document.createElement('div');
        allChip.className = `filter-chip ${state.activeCategory === 'ALL' ? 'active' : ''}`;
        allChip.textContent = 'All Updates';
        allChip.addEventListener('click', () => selectCategory('ALL', allChip));
        elements.filterContainer.appendChild(allChip);

        // Add sorting order for common tags
        const categoryOrder = ['Feature', 'Issue', 'Change', 'Deprecation', 'Announcement'];
        const sortedCategories = Array.from(categories).sort((a, b) => {
            const indexA = categoryOrder.indexOf(a);
            const indexB = categoryOrder.indexOf(b);
            if (indexA !== -1 && indexB !== -1) return indexA - indexB;
            if (indexA !== -1) return -1;
            if (indexB !== -1) return 1;
            return a.localeCompare(b);
        });

        // Add other category chips
        sortedCategories.forEach(cat => {
            const chip = document.createElement('div');
            chip.className = `filter-chip ${state.activeCategory === cat.toUpperCase() ? 'active' : ''}`;
            
            // Count of notes in this category
            const count = state.notes.filter(n => n.type && n.type.trim().toUpperCase() === cat.toUpperCase()).length;
            chip.innerHTML = `${cat} <span style="opacity: 0.6; font-size: 0.8em;">(${count})</span>`;
            
            chip.addEventListener('click', () => selectCategory(cat, chip));
            elements.filterContainer.appendChild(chip);
        });
    }

    function selectCategory(category, chipElement) {
        state.activeCategory = category.toUpperCase();
        
        // Remove active class from all chips
        const chips = elements.filterContainer.querySelectorAll('.filter-chip');
        chips.forEach(c => c.classList.remove('active'));
        
        // Add active to selected
        chipElement.classList.add('active');
        
        applyFiltersAndSearch();
    }

    // Apply filter and search logic
    function applyFiltersAndSearch() {
        state.filteredNotes = state.notes.filter(note => {
            // Category Filter
            const matchesCategory = state.activeCategory === 'ALL' || 
                (note.type && note.type.trim().toUpperCase() === state.activeCategory);
            
            // Search Query Filter
            const searchLower = state.searchQuery.toLowerCase();
            const matchesSearch = !state.searchQuery || 
                (note.content_text && note.content_text.toLowerCase().includes(searchLower)) ||
                (note.date && note.date.toLowerCase().includes(searchLower)) ||
                (note.type && note.type.toLowerCase().includes(searchLower));
                
            return matchesCategory && matchesSearch;
        });

        // Update counts
        elements.filteredNotesCount.textContent = state.filteredNotes.length;
        
        renderNotes();
    }

    // Render list of release notes
    function renderNotes() {
        elements.notesContainer.innerHTML = '';
        
        if (state.filteredNotes.length === 0) {
            elements.notesContainer.innerHTML = `
                <div class="no-results">
                    <div class="no-results-icon">🔍</div>
                    <h3>No release notes match your criteria</h3>
                    <p>Try refining your search text or changing the category filter.</p>
                </div>
            `;
            return;
        }

        state.filteredNotes.forEach(note => {
            const style = getCategoryStyle(note.type);
            
            const card = document.createElement('div');
            card.className = 'note-card';
            card.style.setProperty('--card-accent-color', style.accent);
            
            // Render card content
            card.innerHTML = `
                <div>
                    <div class="note-header">
                        <span class="note-badge" style="--badge-bg: ${style.badgeBg}; --badge-color: ${style.badgeColor};">${style.label}</span>
                        <span class="note-date">${note.date}</span>
                    </div>
                    <div class="note-body">
                        ${note.content_html}
                    </div>
                </div>
                <div class="note-footer">
                    <a href="${note.link}" target="_blank" rel="noopener noreferrer" class="note-link">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
                        View Official Docs
                    </a>
                    <button class="btn-tweet" data-id="${note.id}">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                        Tweet Note
                    </button>
                </div>
            `;
            
            // Add click listener to the Tweet button
            const tweetBtn = card.querySelector('.btn-tweet');
            tweetBtn.addEventListener('click', (e) => {
                e.preventDefault();
                openTweetModal(note);
            });
            
            elements.notesContainer.appendChild(card);
        });
    }

    // Modal state
    let activeNoteForTweet = null;

    // Generate tweet text with character validation and smart truncation
    function openTweetModal(note) {
        activeNoteForTweet = note;
        
        const categoryLabel = getCategoryStyle(note.type).label;
        const link = note.link || 'https://cloud.google.com/bigquery/docs/release-notes';
        
        // Base templates & calculations
        // Layout: 📢 BigQuery [Category] (Date): "Text..." \n\nDetails: Link #GoogleCloud #BigQuery
        const prefix = `📢 BigQuery Update [${categoryLabel}] (${note.date}):\n"`;
        const suffix = `"\n\nDetails: ${link}\n#GoogleCloud #BigQuery`;
        
        // Character bounds
        const maxTweetLen = 280;
        const reservedLen = prefix.length + suffix.length + 3; // +3 for "..." ellipsis
        const availableTextLen = maxTweetLen - reservedLen;
        
        let tweetContentText = note.content_text.replace(/\s+/g, ' '); // normalize spaces
        
        if (tweetContentText.length > availableTextLen) {
            tweetContentText = tweetContentText.substring(0, availableTextLen - 1).trim() + '...';
        }
        
        const defaultTweet = `${prefix}${tweetContentText}${suffix}`;
        
        elements.tweetTextarea.value = defaultTweet;
        updateCharCount();
        
        // Open modal
        elements.tweetModal.classList.add('active');
        elements.tweetTextarea.focus();
    }

    function closeTweetModal() {
        elements.tweetModal.classList.remove('active');
        activeNoteForTweet = null;
    }

    function updateCharCount() {
        const length = elements.tweetTextarea.value.length;
        elements.charCounter.textContent = `${length} / 280`;
        
        // Style character counter warning/danger
        elements.charCounter.className = 'character-counter';
        if (length > 280) {
            elements.charCounter.classList.add('danger');
            elements.submitTweetBtn.disabled = true;
        } else if (length > 250) {
            elements.charCounter.classList.add('warning');
            elements.submitTweetBtn.disabled = false;
        } else {
            elements.submitTweetBtn.disabled = false;
        }
    }

    // Share Tweet Action
    function submitTweet() {
        const tweetText = elements.tweetTextarea.value;
        if (tweetText.length > 280) {
            showToast('Tweet text is too long! Please keep it under 280 characters.', true);
            return;
        }
        
        // Open Twitter intent
        const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText)}`;
        window.open(twitterUrl, '_blank', 'noopener,noreferrer');
        closeTweetModal();
        showToast('Redirected to Twitter/X sharing screen');
    }

    // Copy Tweet Action
    function copyTweet() {
        const tweetText = elements.tweetTextarea.value;
        navigator.clipboard.writeText(tweetText)
            .then(() => {
                showToast('Tweet copied to clipboard!');
            })
            .catch(err => {
                console.error('Failed to copy: ', err);
                showToast('Failed to copy text', true);
            });
    }

    // Event Listeners
    elements.searchInput.addEventListener('input', (e) => {
        state.searchQuery = e.target.value;
        applyFiltersAndSearch();
    });

    elements.refreshBtn.addEventListener('click', () => {
        fetchReleaseNotes(true);
    });

    // Close Modal Listeners
    elements.closeModalBtn.addEventListener('click', closeTweetModal);
    elements.cancelTweetBtn.addEventListener('click', closeTweetModal);
    
    // Close modal by clicking outside
    elements.tweetModal.addEventListener('click', (e) => {
        if (e.target === elements.tweetModal) {
            closeTweetModal();
        }
    });

    // Textarea input monitoring
    elements.tweetTextarea.addEventListener('input', updateCharCount);
    
    // Submit actions
    elements.submitTweetBtn.addEventListener('click', submitTweet);
    elements.copyTweetBtn.addEventListener('click', copyTweet);

    // Initial load
    fetchReleaseNotes(false);
});
