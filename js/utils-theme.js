const themeRoot = document.documentElement;
const savedTheme = localStorage.getItem('utils-theme');
const initialTheme = savedTheme === 'light' || savedTheme === 'dark'
  ? savedTheme
  : (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');

function setUtilsTheme(theme) {
  themeRoot.dataset.theme = theme;
  localStorage.setItem('utils-theme', theme);
  const toggle = document.querySelector('.utils-theme-toggle');
  if (toggle) {
    toggle.textContent = theme === 'dark' ? '☀ Light' : '◐ Dark';
    toggle.setAttribute('aria-label', theme === 'dark' ? '라이트 테마 사용' : '다크 테마 사용');
  }
}

const globalNav = document.createElement('nav');
globalNav.className = 'utils-global-nav';
globalNav.setAttribute('aria-label', 'BlackRabbit Utils');

const homeLink = document.createElement('a');
homeLink.className = 'utils-home-link';
homeLink.href = 'https://blackrabbitdeveloper.github.io/';
homeLink.textContent = '← Home';
homeLink.setAttribute('aria-label', 'BlackRabbit Utils 홈으로 이동');

const themeToggle = document.createElement('button');
themeToggle.type = 'button';
themeToggle.className = 'utils-theme-toggle';
themeToggle.addEventListener('click', () => {
  setUtilsTheme(themeRoot.dataset.theme === 'dark' ? 'light' : 'dark');
});

globalNav.append(homeLink, themeToggle);
const themeHost = document.querySelector('.header-actions');
(themeHost || document.body).prepend(globalNav);
setUtilsTheme(initialTheme);
