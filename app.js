/**
 * LessonVault Application Logic
 * Supports dynamic Subjects and Lessons storage using browser IndexedDB.
 */

// --- 1. INDEXEDDB CONFIGURATION & INITIALIZATION ---
const DB_NAME = "LessonVaultDB_v2";
const DB_VERSION = 1;
let db;

function initDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (e) => {
      const database = e.target.result;

      // 1. Lessons Object Store
      if (!database.objectStoreNames.contains("lessons")) {
        const lessonStore = database.createObjectStore("lessons", { keyPath: "id", autoIncrement: true });
        lessonStore.createIndex("subject", "subject", { unique: false });
        lessonStore.createIndex("createdAt", "createdAt", { unique: false });
      }

      // 2. Subjects Object Store (User-defined)
      if (!database.objectStoreNames.contains("subjects")) {
        database.createObjectStore("subjects", { keyPath: "id", autoIncrement: true });
      }
    };

    request.onsuccess = (e) => {
      db = e.target.result;
      resolve(db);
    };

    request.onerror = (e) => reject("DB Error: " + e.target.errorCode);
  });
}

// --- 2. DATABASE CRUD OPERATIONS ---

// Lessons CRUD
async function dbAddLesson(lesson) {
  return new Promise((res, rej) => {
    const tx = db.transaction(["lessons"], "readwrite");
    const req = tx.objectStore("lessons").add(lesson);
    req.onsuccess = () => res(req.result);
    req.onerror = rej;
  });
}

async function dbUpdateLesson(lesson) {
  return new Promise((res, rej) => {
    const tx = db.transaction(["lessons"], "readwrite");
    const req = tx.objectStore("lessons").put(lesson);
    req.onsuccess = () => res(req.result);
    req.onerror = rej;
  });
}

async function dbGetLessons() {
  return new Promise((res, rej) => {
    const tx = db.transaction(["lessons"], "readonly");
    const req = tx.objectStore("lessons").getAll();
    req.onsuccess = () => res(req.result);
    req.onerror = rej;
  });
}

async function dbDeleteLesson(id) {
  return new Promise((res, rej) => {
    const tx = db.transaction(["lessons"], "readwrite");
    const req = tx.objectStore("lessons").delete(id);
    req.onsuccess = () => res();
    req.onerror = rej;
  });
}

// Subjects CRUD
async function dbGetSubjects() {
  return new Promise((res, rej) => {
    const tx = db.transaction(["subjects"], "readonly");
    const req = tx.objectStore("subjects").getAll();
    req.onsuccess = () => res(req.result);
    req.onerror = rej;
  });
}

async function dbAddSubject(name) {
  return new Promise((res, rej) => {
    const tx = db.transaction(["subjects"], "readwrite");
    const req = tx.objectStore("subjects").add({ name, createdAt: new Date().toISOString() });
    req.onsuccess = () => res(req.result);
    req.onerror = rej;
  });
}

async function dbUpdateSubject(id, newName) {
  return new Promise((res, rej) => {
    const tx = db.transaction(["subjects"], "readwrite");
    const store = tx.objectStore("subjects");
    const getReq = store.get(id);

    getReq.onsuccess = () => {
      const data = getReq.result;
      data.name = newName;
      const updateReq = store.put(data);
      updateReq.onsuccess = () => res();
      updateReq.onerror = rej;
    };
  });
}

async function dbDeleteSubject(id, subjectName) {
  return new Promise(async (res, rej) => {
    // 1. Delete the subject
    const tx = db.transaction(["subjects"], "readwrite");
    tx.objectStore("subjects").delete(id);
    
    // 2. Also rename any lesson associated with this deleted subject to 'Uncategorized'
    const lessons = await dbGetLessons();
    const updateTx = db.transaction(["lessons"], "readwrite");
    const lStore = updateTx.objectStore("lessons");

    lessons.forEach(lesson => {
      if (lesson.subject === subjectName) {
        lesson.subject = "Uncategorized";
        lStore.put(lesson);
      }
    });

    updateTx.oncomplete = () => res();
    updateTx.onerror = rej;
  });
}

// --- 3. LIVE CLOCK & MINI-CALENDAR WIDGET ---
let currentCalDate = new Date();

function initClockAndCalendar() {
  function updateClock() {
    const now = new Date();
    document.getElementById("liveClock").textContent = now.toLocaleTimeString([], { hour12: false });
    document.getElementById("liveDateShort").textContent = now.toLocaleDateString(undefined, {
      weekday: "long",
      month: "short",
      day: "numeric",
      year: "numeric"
    });
  }

  setInterval(updateClock, 1000);
  updateClock();
  renderCalendar(currentCalDate);

  document.getElementById("prevMonthBtn").addEventListener("click", () => {
    currentCalDate.setMonth(currentCalDate.getMonth() - 1);
    renderCalendar(currentCalDate);
  });

  document.getElementById("nextMonthBtn").addEventListener("click", () => {
    currentCalDate.setMonth(currentCalDate.getMonth() + 1);
    renderCalendar(currentCalDate);
  });
}

function renderCalendar(date) {
  const monthYearLabel = document.getElementById("calendarMonthYear");
  const daysContainer = document.getElementById("calendarDays");
  daysContainer.innerHTML = "";

  const year = date.getFullYear();
  const month = date.getMonth();

  monthYearLabel.textContent = date.toLocaleDateString(undefined, { month: "long", year: "numeric" });

  const firstDayIndex = new Date(year, month, 1).getDay();
  const totalDays = new Date(year, month + 1, 0).getDate();
  const today = new Date();

  // Empty slots for previous month offset
  for (let i = 0; i < firstDayIndex; i++) {
    const empty = document.createElement("div");
    daysContainer.appendChild(empty);
  }

  // Days of current month
  for (let day = 1; day <= totalDays; day++) {
    const dayEl = document.createElement("div");
    dayEl.className = "py-1.5 rounded-lg text-slate-300 hover:bg-slate-800 transition cursor-pointer text-xs";
    dayEl.textContent = day;

    if (
      day === today.getDate() &&
      month === today.getMonth() &&
      year === today.getFullYear()
    ) {
      dayEl.classList.add("calendar-today");
    }

    daysContainer.appendChild(dayEl);
  }
}

// --- 4. TIME UTILITY (RELATIVE & ABSOLUTE FORMATTING) ---
function formatDates(isoString) {
  const date = new Date(isoString);
  const full = date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });

  // Relative time computation
  const diffSec = Math.floor((new Date() - date) / 1000);
  let relative = "Just now";
  if (diffSec >= 60 && diffSec < 3600) relative = `${Math.floor(diffSec / 60)}m ago`;
  else if (diffSec >= 3600 && diffSec < 86400) relative = `${Math.floor(diffSec / 3600)}h ago`;
  else if (diffSec >= 86400) relative = `${Math.floor(diffSec / 86400)}d ago`;

  return { full, relative };
}

// --- 5. RENDER LESSONS & SUBJECTS ---
async function refreshAll() {
  const subjects = await dbGetSubjects();
  const lessons = await dbGetLessons();

  renderSubjectDropdowns(subjects);
  renderSubjectSidebar(subjects, lessons);
  renderSubjectManageList(subjects);
  renderLessonsGrid(lessons);
}

function renderSubjectDropdowns(subjects) {
  const filterSelect = document.getElementById("subjectFilterSelect");
  const formSelect = document.getElementById("lessonSubjectSelect");

  const currentFilterVal = filterSelect.value;
  const currentFormVal = formSelect.value;

  // Filter dropdown
  filterSelect.innerHTML = `<option value="all">All Subjects</option>`;
  subjects.forEach(s => {
    filterSelect.innerHTML += `<option value="${s.name}">${s.name}</option>`;
  });
  if ([...filterSelect.options].some(o => o.value === currentFilterVal)) {
    filterSelect.value = currentFilterVal;
  }

  // Form dropdown
  formSelect.innerHTML = "";
  if (subjects.length === 0) {
    formSelect.innerHTML = `<option value="General">General (Default)</option>`;
  } else {
    subjects.forEach(s => {
      formSelect.innerHTML += `<option value="${s.name}">${s.name}</option>`;
    });
  }
  if ([...formSelect.options].some(o => o.value === currentFormVal)) {
    formSelect.value = currentFormVal;
  }
}

function renderSubjectSidebar(subjects, lessons) {
  const list = document.getElementById("subjectListSidebar");
  const countBadge = document.getElementById("subjectCountBadge");
  countBadge.textContent = subjects.length;

  list.innerHTML = "";

  if (subjects.length === 0) {
    list.innerHTML = `<p class="text-xs text-slate-500 py-2">No subjects yet. Click 'Manage Subjects' to add one.</p>`;
    return;
  }

  subjects.forEach(sub => {
    const count = lessons.filter(l => l.subject === sub.name).length;
    const item = document.createElement("div");
    item.className = "flex items-center justify-between text-xs py-1.5 px-2 rounded-lg hover:bg-slate-800/80 cursor-pointer text-slate-300 transition";
    item.innerHTML = `
      <span class="truncate hover:text-white font-medium">${sub.name}</span>
      <span class="text-[10px] bg-slate-800 text-blue-400 px-1.5 py-0.5 rounded-full">${count}</span>
    `;
    item.addEventListener("click", () => {
      document.getElementById("subjectFilterSelect").value = sub.name;
      applyFiltersAndSort();
    });
    list.appendChild(item);
  });
}

function renderSubjectManageList(subjects) {
  const container = document.getElementById("subjectManageList");
  container.innerHTML = "";

  if (subjects.length === 0) {
    container.innerHTML = `<div class="p-3 text-xs text-slate-500 text-center">No subjects created yet.</div>`;
    return;
  }

  subjects.forEach(sub => {
    const row = document.createElement("div");
    row.className = "p-3 flex items-center justify-between gap-3 text-xs bg-slate-900";
    row.innerHTML = `
      <span class="text-slate-200 font-medium truncate subject-name-label">${sub.name}</span>
      <div class="flex items-center gap-1.5">
        <button class="edit-sub-btn p-1 text-slate-400 hover:text-blue-400 rounded transition" title="Rename Subject">
          <i data-lucide="edit-2" class="w-3.5 h-3.5"></i>
        </button>
        <button class="del-sub-btn p-1 text-slate-400 hover:text-rose-400 rounded transition" title="Delete Subject">
          <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
        </button>
      </div>
    `;

    // Edit Subject Name
    row.querySelector(".edit-sub-btn").addEventListener("click", async () => {
      const newName = prompt(`Rename subject "${sub.name}" to:`, sub.name);
      if (newName && newName.trim() !== "" && newName.trim() !== sub.name) {
        await dbUpdateSubject(sub.id, newName.trim());
        refreshAll();
      }
    });

    // Delete Subject
    row.querySelector(".del-sub-btn").addEventListener("click", async () => {
      if (confirm(`Delete subject "${sub.name}"? Existing lessons will become "Uncategorized".`)) {
        await dbDeleteSubject(sub.id, sub.name);
        refreshAll();
      }
    });

    container.appendChild(row);
  });

  lucide.createIcons();
}

async function applyFiltersAndSort() {
  const lessons = await dbGetLessons();
  const search = document.getElementById("searchInput").value.toLowerCase();
  const selectedSubject = document.getElementById("subjectFilterSelect").value;
  const sortOrder = document.getElementById("sortOrderSelect").value;

  let filtered = lessons.filter(l => {
    const matchesSubject = selectedSubject === "all" || l.subject === selectedSubject;
    const matchesSearch =
      l.title.toLowerCase().includes(search) ||
      (l.notes && l.notes.toLowerCase().includes(search)) ||
      (l.file && l.file.name.toLowerCase().includes(search));
    return matchesSubject && matchesSearch;
  });

  // Sorting
  if (sortOrder === "newest") {
    filtered.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  } else if (sortOrder === "oldest") {
    filtered.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  } else if (sortOrder === "title") {
    filtered.sort((a, b) => a.title.localeCompare(b.title));
  }

  renderLessonsGrid(filtered);
}

function renderLessonsGrid(lessons) {
  const grid = document.getElementById("lessonsGrid");
  const empty = document.getElementById("emptyLessonsState");
  grid.innerHTML = "";

  if (lessons.length === 0) {
    empty.classList.remove("hidden");
    return;
  }
  empty.classList.add("hidden");

  lessons.forEach(lesson => {
    const { full, relative } = formatDates(lesson.createdAt);

    const card = document.createElement("div");
    card.className = "bg-slate-900 border border-slate-800 rounded-xl p-5 flex flex-col justify-between hover:border-blue-500/50 transition group";

    let fileSnippet = "";
    if (lesson.file) {
      fileSnippet = `
        <div class="mt-3 pt-3 border-t border-slate-800 flex items-center justify-between text-xs">
          <div class="flex items-center gap-1.5 text-slate-300 truncate max-w-[200px]" title="${lesson.file.name}">
            <i data-lucide="paperclip" class="w-3.5 h-3.5 text-blue-400 flex-shrink-0"></i>
            <span class="truncate">${lesson.file.name}</span>
          </div>
          <button class="download-file-btn text-blue-400 hover:text-blue-300 text-xs font-semibold flex items-center gap-1 ml-2" data-id="${lesson.id}">
            <i data-lucide="download" class="w-3.5 h-3.5"></i> Download
          </button>
        </div>
      `;
    }

    card.innerHTML = `
      <div>
        <!-- Top bar: Subject badge and Action Buttons -->
        <div class="flex items-center justify-between gap-2 mb-2.5">
          <span class="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-blue-950 text-blue-400 border border-blue-900/50">
            ${lesson.subject}
          </span>
          <div class="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition">
            <button class="edit-lesson-btn p-1 text-slate-400 hover:text-blue-400 transition" data-id="${lesson.id}" title="Edit Lesson">
              <i data-lucide="pencil" class="w-3.5 h-3.5"></i>
            </button>
            <button class="delete-lesson-btn p-1 text-slate-400 hover:text-rose-400 transition" data-id="${lesson.id}" title="Delete Lesson">
              <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
            </button>
          </div>
        </div>

        <h3 class="text-sm font-bold text-white mb-1.5 leading-snug">${lesson.title}</h3>
        <p class="text-xs text-slate-400 leading-relaxed line-clamp-3">${lesson.notes || "No notes provided."}</p>
      </div>

      <div>
        ${fileSnippet}

        <!-- Uploaded Timestamp -->
        <div class="flex items-center justify-between text-[11px] text-slate-500 mt-3 pt-2 border-t border-slate-800/60">
          <span class="flex items-center gap-1" title="Uploaded at ${full}">
            <i data-lucide="clock" class="w-3 h-3 text-slate-500"></i> ${relative}
          </span>
          <span class="text-[10px] text-slate-500">${full}</span>
        </div>
      </div>
    `;

    // Download trigger
    const downloadBtn = card.querySelector(".download-file-btn");
    if (downloadBtn) {
      downloadBtn.addEventListener("click", () => downloadLessonFile(lesson.id));
    }

    // Delete trigger
    card.querySelector(".delete-lesson-btn").addEventListener("click", async () => {
      if (confirm(`Are you sure you want to delete "${lesson.title}"?`)) {
        await dbDeleteLesson(lesson.id);
        refreshAll();
      }
    });

    // Edit trigger
    card.querySelector(".edit-lesson-btn").addEventListener("click", () => openEditLessonModal(lesson));

    grid.appendChild(card);
  });

  lucide.createIcons();
}

async function downloadLessonFile(id) {
  const lessons = await dbGetLessons();
  const target = lessons.find(l => l.id === id);
  if (target && target.file && target.file.blob) {
    const url = URL.createObjectURL(target.file.blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = target.file.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}

// --- 6. MODALS & FORMS LOGIC ---

// Lesson Modal Controls
const lessonModal = document.getElementById("lessonModal");
const lessonForm = document.getElementById("lessonForm");
let existingFileBlob = null; // Holds file reference when editing without replacing

function toggleLessonModal(show) {
  if (show) lessonModal.classList.add("modal-show");
  else {
    lessonModal.classList.remove("modal-show");
    lessonForm.reset();
    document.getElementById("editLessonId").value = "";
    document.getElementById("currentFileNotice").classList.add("hidden");
    existingFileBlob = null;
  }
}

function openEditLessonModal(lesson) {
  document.getElementById("lessonModalTitle").textContent = "Edit Lesson";
  document.getElementById("editLessonId").value = lesson.id;
  document.getElementById("lessonTitleInput").value = lesson.title;
  document.getElementById("lessonSubjectSelect").value = lesson.subject;
  document.getElementById("lessonNotesInput").value = lesson.notes || "";

  const notice = document.getElementById("currentFileNotice");
  if (lesson.file) {
    existingFileBlob = lesson.file;
    document.getElementById("currentFileName").textContent = `Attached: ${lesson.file.name}`;
    notice.classList.remove("hidden");
  } else {
    existingFileBlob = null;
    notice.classList.add("hidden");
  }

  toggleLessonModal(true);
}

document.getElementById("removeFileBtn").addEventListener("click", () => {
  existingFileBlob = null;
  document.getElementById("currentFileNotice").classList.add("hidden");
});

document.getElementById("openLessonModalBtn").addEventListener("click", () => {
  document.getElementById("lessonModalTitle").textContent = "Create New Lesson";
  toggleLessonModal(true);
});
document.getElementById("emptyNewLessonBtn").addEventListener("click", () => {
  document.getElementById("lessonModalTitle").textContent = "Create New Lesson";
  toggleLessonModal(true);
});
document.getElementById("closeLessonModalBtn").addEventListener("click", () => toggleLessonModal(false));
document.getElementById("cancelLessonBtn").addEventListener("click", () => toggleLessonModal(false));

// Save Lesson (Create or Update)
lessonForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const id = document.getElementById("editLessonId").value;
  const title = document.getElementById("lessonTitleInput").value.trim();
  const subject = document.getElementById("lessonSubjectSelect").value;
  const notes = document.getElementById("lessonNotesInput").value.trim();
  const fileInput = document.getElementById("lessonFileInput");
  const newlyPickedFile = fileInput.files[0];

  let filePayload = null;
  if (newlyPickedFile) {
    filePayload = {
      name: newlyPickedFile.name,
      type: newlyPickedFile.type,
      size: newlyPickedFile.size,
      blob: newlyPickedFile
    };
  } else if (existingFileBlob) {
    filePayload = existingFileBlob;
  }

  if (id) {
    // Updating existing lesson
    const updated = {
      id: Number(id),
      title,
      subject,
      notes,
      file: filePayload,
      createdAt: new Date().toISOString() // Updates modification time
    };
    await dbUpdateLesson(updated);
  } else {
    // Creating brand new lesson
    const newLesson = {
      title,
      subject,
      notes,
      file: filePayload,
      createdAt: new Date().toISOString()
    };
    await dbAddLesson(newLesson);
  }

  toggleLessonModal(false);
  refreshAll();
});

// Subject Modal Controls
const subjectModal = document.getElementById("subjectModal");
const addSubjectForm = document.getElementById("addSubjectForm");

function toggleSubjectModal(show) {
  if (show) subjectModal.classList.add("modal-show");
  else subjectModal.classList.remove("modal-show");
}

document.getElementById("openSubjectModalBtn").addEventListener("click", () => toggleSubjectModal(true));
document.getElementById("quickAddSubjectBtn").addEventListener("click", () => toggleSubjectModal(true));
document.getElementById("closeSubjectModalBtn").addEventListener("click", () => toggleSubjectModal(false));
document.getElementById("doneSubjectBtn").addEventListener("click", () => toggleSubjectModal(false));

addSubjectForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const nameInput = document.getElementById("newSubjectNameInput");
  const name = nameInput.value.trim();
  if (name) {
    await dbAddSubject(name);
    nameInput.value = "";
    refreshAll();
  }
});

// Listeners for filters
document.getElementById("searchInput").addEventListener("input", applyFiltersAndSort);
document.getElementById("subjectFilterSelect").addEventListener("change", applyFiltersAndSort);
document.getElementById("sortOrderSelect").addEventListener("change", applyFiltersAndSort);

// --- 7. APP BOOTSTRAP ---
window.addEventListener("DOMContentLoaded", async () => {
  await initDB();
  initClockAndCalendar();

  // If opening for the very first time, seed one default subject if empty
  const existingSubs = await dbGetSubjects();
  if (existingSubs.length === 0) {
    await dbAddSubject("General Studies");
  }

  refreshAll();
});