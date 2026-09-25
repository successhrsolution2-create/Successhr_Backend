const fs = require('fs');
let code = fs.readFileSync('../frontend/src/candidate/pages/admin/Candidates/CandidatesList.jsx', 'utf8');

if (!code.includes('atsSearch')) {
  code = code.replace(
    "search: searchParams.get('search') || '',",
    "search: searchParams.get('search') || '',\n    atsSearch: searchParams.get('atsSearch') || '',"
  );
  
  code = code.replace(
    "search: filters.search,",
    "search: filters.search,\n            atsSearch: filters.atsSearch,"
  );

  code = code.replace(
    "value={filters.search}",
    `value={filters.search}
            onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))}
            placeholder={searchPlaceholder}
            className="h-9 w-full rounded-md border border-[#d4dde8] bg-white px-3 text-[13px] text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[#0b65ac] focus:ring-2 focus:ring-[#d9ecff]"
          />
          <input
            value={filters.atsSearch || ''}
            onChange={(event) => setFilters((current) => ({ ...current, atsSearch: event.target.value }))}
            placeholder="ATS Skill Scan (Deep Resume Search)"`
  );
  
  // Also need to push it to URL params
  code = code.replace(
    "if (filters.search) params.search = filters.search",
    "if (filters.search) params.search = filters.search\n    if (filters.atsSearch) params.atsSearch = filters.atsSearch"
  );
  
  fs.writeFileSync('../frontend/src/candidate/pages/admin/Candidates/CandidatesList.jsx', code);
  console.log('Done');
} else {
  console.log('Already patched');
}
