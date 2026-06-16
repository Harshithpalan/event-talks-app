import os
import time
import requests
import xml.etree.ElementTree as ET
from flask import Flask, jsonify, render_template, request
from bs4 import BeautifulSoup
import hashlib

app = Flask(__name__)

# Cache structure
cache = {
    'data': None,
    'last_updated': 0
}
CACHE_TIMEOUT = 1800  # 30 minutes in seconds
FEED_URL = "https://docs.cloud.google.com/feeds/bigquery-release-notes.xml"

def fetch_and_parse_feed(bypass_cache=False):
    global cache
    now = time.time()
    if not bypass_cache and cache['data'] is not None and (now - cache['last_updated'] < CACHE_TIMEOUT):
        return cache['data'], False

    try:
        # Fetch with a headers User-Agent to avoid getting blocked
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
        response = requests.get(FEED_URL, headers=headers, timeout=15)
        response.raise_for_status()
        
        # Parse XML
        root = ET.fromstring(response.content)
        ns = {'atom': 'http://www.w3.org/2005/Atom'}
        
        parsed_entries = []
        
        for entry in root.findall('atom:entry', ns):
            title_elem = entry.find('atom:title', ns)
            date_str = title_elem.text.strip() if title_elem is not None else "Unknown Date"
            
            updated_elem = entry.find('atom:updated', ns)
            updated_str = updated_elem.text.strip() if updated_elem is not None else ""
            
            link_elem = entry.find('atom:link[@rel="alternate"]', ns)
            link_url = link_elem.attrib['href'].strip() if link_elem is not None else ""
            
            content_elem = entry.find('atom:content', ns)
            content_html = content_elem.text if content_elem is not None else ""
            
            # Parse HTML content to separate individual notes by h3 tags
            soup = BeautifulSoup(content_html, 'html.parser')
            
            current_type = None
            current_content = []
            
            def add_note(note_type, elements):
                if not note_type or not elements:
                    return
                # Render HTML representation of elements
                html_str = "".join([str(el) for el in elements]).strip()
                # Create plain text version
                temp_soup = BeautifulSoup(html_str, 'html.parser')
                text_str = temp_soup.get_text().strip()
                
                # Assign a unique ID for referencing or sharing
                note_id = hashlib.md5(f"{date_str}-{note_type}-{text_str[:40]}".encode('utf-8')).hexdigest()[:12]
                
                parsed_entries.append({
                    'id': note_id,
                    'date': date_str,
                    'updated': updated_str,
                    'link': link_url,
                    'type': note_type,
                    'content_html': html_str,
                    'content_text': text_str
                })

            for child in soup.contents:
                if child.name == 'h3':
                    add_note(current_type, current_content)
                    current_type = child.get_text().strip()
                    current_content = []
                elif child.name is not None:
                    current_content.append(child)
            
            # Add the final note in the entry
            add_note(current_type, current_content)
            
        cache['data'] = parsed_entries
        cache['last_updated'] = now
        return parsed_entries, True
        
    except Exception as e:
        print(f"Error fetching or parsing feed: {e}")
        # If fetch fails but we have cached data, return the cached data (graceful fallback)
        if cache['data'] is not None:
            return cache['data'], False
        raise e

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/release-notes')
def get_release_notes():
    force_refresh = request.args.get('refresh', 'false').lower() == 'true'
    try:
        notes, fetched_fresh = fetch_and_parse_feed(bypass_cache=force_refresh)
        return jsonify({
            'status': 'success',
            'count': len(notes),
            'fetched_fresh': fetched_fresh,
            'last_updated': cache['last_updated'],
            'notes': notes
        })
    except Exception as e:
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 500

if __name__ == '__main__':
    # Run Flask server locally
    app.run(debug=True, host='127.0.0.1', port=5000)
