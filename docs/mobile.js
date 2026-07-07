const STORAGE_KEY = "rushcare.mobile.settings.v1";
const CACHE_KEY = "rushcare.mobile.cache.v1";
const todayISO = localDateISO(new Date());

let state = {
  customers: [],
  jobs: [],
  photos: [],
  technicians: []
};
let activeTab = "today";

const $ = (selector) => document.querySelector(selector);
const els = {
  todayLabel: $("#todayLabel"),
  reloadBtn: $("#reloadBtn"),
  openSettings: $("#openSettings"),
  openJobDialog: $("#openJobDialog"),
  closeJobDialog: $("#closeJobDialog"),
  settingsDialog: $("#settingsDialog"),
  jobDialog: $("#jobDialog"),
  jobForm: $("#jobForm"),
  techOptions: $("#techOptions"),
  scriptUrlInput: $("#scriptUrlInput"),
  saveSettings: $("#saveSettings"),
  searchInput: $("#searchInput"),
  toast: $("#toast"),
  metricToday: $("#metricToday"),
  metricActive: $("#metricActive"),
  metricRevenue: $("#metricRevenue"),
  metricUnpaid: $("#metricUnpaid"),
  todayCount: $("#todayCount"),
  jobsCount: $("#jobsCount"),
  customersCount: $("#customersCount"),
  paymentsCount: $("#paymentsCount"),
  techsCount: $("#techsCount"),
  todayList: $("#todayList"),
  jobsList: $("#jobsList"),
  customersList: $("#customersList"),
  paymentsList: $("#paymentsList"),
  techsList: $("#techsList")
};

init();

function init() {
  els.todayLabel.textContent = new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short"
  }).format(new Date());

  const settings = getSettings();
  els.scriptUrlInput.value = settings.scriptUrl || "";

  const cached = loadCache();
  if (cached) {
    state = normalizeData(cached);
    render();
  } else {
    render();
  }

  bindEvents();

  if (settings.scriptUrl) {
    loadFromDb();
  } else {
    showToast("DB 설정에 Apps Script 웹앱 URL을 입력하세요.");
  }
}

function bindEvents() {
  els.reloadBtn.addEventListener("click", loadFromDb);
  els.openSettings.addEventListener("click", () => els.settingsDialog.showModal());
  els.openJobDialog.addEventListener("click", openJobDialog);
  els.closeJobDialog.addEventListener("click", () => els.jobDialog.close());
  els.jobForm.addEventListener("submit", submitJob);
  els.saveSettings.addEventListener("click", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ scriptUrl: els.scriptUrlInput.value.trim() }));
    showToast("DB 설정을 저장했습니다.");
  });
  els.searchInput.addEventListener("input", render);

  document.querySelectorAll("[data-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      activeTab = button.dataset.tab;
      document.querySelectorAll("[data-tab]").forEach((item) => item.classList.toggle("active", item === button));
      document.querySelectorAll(".tab-panel").forEach((panel) => panel.classList.remove("active"));
      $(`#${activeTab}Panel`).classList.add("active");
      render();
    });
  });
}

function getSettings() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

function loadCache() {
  try {
    const cache = JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
    return cache && cache.data ? cache.data : null;
  } catch {
    return null;
  }
}

function loadFromDb() {
  const { scriptUrl } = getSettings();
  if (!scriptUrl) {
    els.settingsDialog.showModal();
    showToast("DB URL을 먼저 저장하세요.");
    return;
  }

  els.reloadBtn.disabled = true;
  els.reloadBtn.textContent = "불러오는 중";

  jsonp(scriptUrl, { action: "getData" })
    .then((result) => {
      if (!result || !result.ok) throw new Error(result && result.error ? result.error : "DB 불러오기 실패");
      state = normalizeData(result.data || {});
      localStorage.setItem(CACHE_KEY, JSON.stringify({ savedAt: new Date().toISOString(), data: state }));
      render();
      showToast("DB 데이터를 불러왔습니다.");
    })
    .catch((error) => showToast(error.message || String(error)))
    .finally(() => {
      els.reloadBtn.disabled = false;
      els.reloadBtn.textContent = "DB 불러오기";
    });
}

function openJobDialog() {
  els.jobForm.reset();
  $("#jobDate").value = todayISO;
  $("#jobTaxDocType").value = "간이영수증";
  $("#jobStatus").value = "접수";
  renderTechOptions();
  els.jobDialog.showModal();
}

function submitJob(event) {
  event.preventDefault();
  const { scriptUrl } = getSettings();
  if (!scriptUrl) {
    els.jobDialog.close();
    els.settingsDialog.showModal();
    showToast("DB URL을 먼저 저장하세요.");
    return;
  }

  const job = Object.fromEntries(new FormData(els.jobForm).entries());
  job.id = createId();
  job.amount = toNumber(job.amount);
  job.paid = false;

  $("#saveJob").disabled = true;
  $("#saveJob").textContent = "등록 중";

  jsonp(scriptUrl, { action: "addJob", data: encodeBase64Utf8(JSON.stringify(job)) })
    .then((result) => {
      if (!result || !result.ok) throw new Error(result && result.error ? result.error : "작업 등록 실패");
      const addedJob = normalizeJob(result.job || job);
      state.jobs.push(addedJob);
      if (result.customer && !state.customers.some((customer) => customer.id === result.customer.id)) {
        state.customers.push(result.customer);
      }
      localStorage.setItem(CACHE_KEY, JSON.stringify({ savedAt: new Date().toISOString(), data: state }));
      els.jobDialog.close();
      activeTab = "jobs";
      document.querySelectorAll("[data-tab]").forEach((item) => item.classList.toggle("active", item.dataset.tab === "jobs"));
      document.querySelectorAll(".tab-panel").forEach((panel) => panel.classList.remove("active"));
      $("#jobsPanel").classList.add("active");
      render();
      showToast("새 작업을 등록했습니다.");
      loadFromDb();
    })
    .catch((error) => showToast(error.message || String(error)))
    .finally(() => {
      $("#saveJob").disabled = false;
      $("#saveJob").textContent = "등록";
    });
}

function jsonp(url, params) {
  return new Promise((resolve, reject) => {
    const callback = `rushcareJsonp_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
    const script = document.createElement("script");
    const cleanUrl = new URL(url);
    Object.entries(params).forEach(([key, value]) => cleanUrl.searchParams.set(key, value));
    cleanUrl.searchParams.set("callback", callback);

    const timer = window.setTimeout(() => {
      cleanup();
      reject(new Error("DB 응답 시간이 초과되었습니다."));
    }, 20000);

    window[callback] = (data) => {
      cleanup();
      resolve(data);
    };

    script.onerror = () => {
      cleanup();
      reject(new Error("DB URL을 확인하세요."));
    };

    function cleanup() {
      window.clearTimeout(timer);
      delete window[callback];
      script.remove();
    }

    script.src = cleanUrl.toString();
    document.body.appendChild(script);
  });
}

function normalizeData(data) {
  return {
    customers: Array.isArray(data.customers) ? data.customers : [],
    jobs: Array.isArray(data.jobs) ? data.jobs.map(normalizeJob) : [],
    photos: Array.isArray(data.photos) ? data.photos : [],
    technicians: Array.isArray(data.technicians) ? data.technicians : []
  };
}

function normalizeJob(job) {
  return {
    ...job,
    date: normalizeDate(job.date),
    amount: toNumber(job.amount),
    paid: job.paid === true || job.paid === "true"
  };
}

function normalizeDate(value) {
  const raw = String(value || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? raw : localDateISO(parsed);
}

function render() {
  const query = els.searchInput.value.trim().toLowerCase();
  const jobs = sortJobs(state.jobs);
  const filteredJobs = jobs.filter((job) => matchesJob(job, query));
  const filteredCustomers = state.customers.filter((customer) => matchesCustomer(customer, query));
  const todayJobs = filteredJobs.filter((job) => job.date === todayISO);
  const paymentJobs = filteredJobs.filter((job) => !job.paid || job.status === "미수금");
  const techs = state.technicians.filter((tech) => matchesText([tech.name, tech.phone, tech.note], query));

  renderMetrics(jobs);
  renderList(els.todayList, todayJobs, renderJobCard, "오늘 일정이 없습니다.");
  renderList(els.jobsList, filteredJobs.slice(0, query ? 200 : 60), renderJobCard, "작업 내역이 없습니다.");
  renderList(els.customersList, filteredCustomers.slice(0, query ? 200 : 60), renderCustomerCard, "고객 내역이 없습니다.");
  renderList(els.paymentsList, paymentJobs.slice(0, query ? 200 : 60), renderPaymentCard, "미수 작업이 없습니다.");
  renderList(els.techsList, techs, renderTechCard, "기사 내역이 없습니다.");

  els.todayCount.textContent = `${todayJobs.length}건`;
  els.jobsCount.textContent = `${filteredJobs.length}건`;
  els.customersCount.textContent = `${filteredCustomers.length}명`;
  els.paymentsCount.textContent = `${paymentJobs.length}건`;
  els.techsCount.textContent = `${techs.length}명`;
  renderTechOptions();
}

function renderMetrics(jobs) {
  const todayJobs = jobs.filter((job) => job.date === todayISO);
  const activeJobs = jobs.filter((job) => !["완료", "취소"].includes(job.status || ""));
  const ym = todayISO.slice(0, 7);
  const monthRevenue = jobs
    .filter((job) => job.date && job.date.slice(0, 7) === ym && job.status === "완료")
    .reduce((sum, job) => sum + toNumber(job.amount), 0);
  const unpaid = jobs
    .filter((job) => !job.paid || job.status === "미수금")
    .reduce((sum, job) => sum + toNumber(job.amount), 0);

  els.metricToday.textContent = todayJobs.length;
  els.metricActive.textContent = activeJobs.length;
  els.metricRevenue.textContent = formatWon(monthRevenue);
  els.metricUnpaid.textContent = formatWon(unpaid);
}

function renderList(target, items, renderer, emptyText) {
  target.innerHTML = "";
  if (!items.length) {
    target.innerHTML = `<div class="empty">${escapeHtml(emptyText)}</div>`;
    return;
  }
  target.insertAdjacentHTML("beforeend", items.map(renderer).join(""));
}

function renderJobCard(job) {
  return `
    <article class="item-card">
      <div class="item-top">
        <div class="item-title">${escapeHtml(job.date || "-")} ${escapeHtml(job.time || "")}<br>${escapeHtml(job.customer || "-")}</div>
        <span class="badge">${escapeHtml(job.status || "접수")}</span>
      </div>
      <div class="item-meta">
        ${escapeHtml(job.type || "-")} · ${escapeHtml(job.tech || "담당자 없음")} · ${escapeHtml(formatWon(job.amount))}<br>
        ${escapeHtml(job.address || "")}<br>
        ${escapeHtml(job.memo || "")}
      </div>
    </article>
  `;
}

function renderPaymentCard(job) {
  return `
    <article class="item-card">
      <div class="item-top">
        <div class="item-title">${escapeHtml(job.customer || "-")}</div>
        <span class="badge amount-danger">${escapeHtml(formatWon(job.amount))}</span>
      </div>
      <div class="item-meta">
        ${escapeHtml(job.date || "-")} · ${escapeHtml(job.type || "-")} · ${escapeHtml(job.paymentMethod || "-")}<br>
        ${escapeHtml(job.address || "")}
      </div>
    </article>
  `;
}

function renderCustomerCard(customer) {
  return `
    <article class="item-card">
      <div class="item-top">
        <div class="item-title">${escapeHtml(customer.name || "-")}</div>
        <span class="badge">${escapeHtml(customer.cycle || "관리")}</span>
      </div>
      <div class="item-meta">
        ${escapeHtml(customer.phone || "")}<br>
        ${escapeHtml(customer.address || "")}<br>
        ${escapeHtml(customer.note || "")}
      </div>
    </article>
  `;
}

function renderTechCard(tech) {
  const techJobs = state.jobs.filter((job) => (job.tech || "") === (tech.name || ""));
  const revenue = techJobs.reduce((sum, job) => sum + toNumber(job.amount), 0);
  const lastJob = sortJobs(techJobs)[0];
  return `
    <article class="item-card">
      <div class="item-top">
        <div class="item-title">${escapeHtml(tech.name || "-")}</div>
        <span class="badge">${techJobs.length}건</span>
      </div>
      <div class="item-meta">
        ${escapeHtml(tech.phone || "")}<br>
        총 금액 ${escapeHtml(formatWon(revenue))}<br>
        최근 작업 ${escapeHtml(lastJob ? `${lastJob.date} ${lastJob.customer || ""} ${lastJob.type || ""}` : "-")}
      </div>
    </article>
  `;
}

function renderTechOptions() {
  els.techOptions.innerHTML = state.technicians
    .map((tech) => `<option value="${escapeHtml(tech.name || "")}"></option>`)
    .join("");
}

function sortJobs(jobs) {
  return [...jobs].sort((a, b) => {
    const aKey = `${a.date || ""} ${a.time || ""} ${a.createdAt || ""}`;
    const bKey = `${b.date || ""} ${b.time || ""} ${b.createdAt || ""}`;
    return bKey.localeCompare(aKey);
  });
}

function matchesJob(job, query) {
  return matchesText([job.customer, job.phone, job.address, job.type, job.tech, job.memo, job.status], query);
}

function matchesCustomer(customer, query) {
  return matchesText([customer.name, customer.phone, customer.address, customer.building, customer.note], query);
}

function matchesText(values, query) {
  if (!query) return true;
  return values.some((value) => String(value || "").toLowerCase().includes(query));
}

function toNumber(value) {
  const number = Number(String(value || "0").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(number) ? number : 0;
}

function formatWon(value) {
  return `${toNumber(value).toLocaleString("ko-KR")}원`;
}

function localDateISO(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function createId() {
  if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
  return `mobile-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

function encodeBase64Utf8(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  bytes.forEach((byte) => binary += String.fromCharCode(byte));
  return btoa(binary);
}

function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("show");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => els.toast.classList.remove("show"), 3200);
}
