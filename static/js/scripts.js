const contentDir = 'contents/';
const configFile = 'config.yml';
const articleManifestFile = 'articles/index.yml';

function applyConfig(config) {
    Object.keys(config).forEach(key => {
        if (key === 'title' && document.body.dataset.skipConfigTitle === 'true') {
            return;
        }
        const element = document.getElementById(key);
        if (element) {
            element.innerHTML = config[key];
        }
    });
}

function activateResponsiveNav() {
    const mainNav = document.body.querySelector('#mainNav');
    if (mainNav) {
        new bootstrap.ScrollSpy(document.body, {
            target: '#mainNav',
            offset: 74,
        });
    }

    const navbarToggler = document.body.querySelector('.navbar-toggler');
    if (!navbarToggler) {
        return;
    }

    const responsiveNavItems = [].slice.call(
        document.querySelectorAll('#navbarResponsive .nav-link')
    );

    responsiveNavItems.forEach(responsiveNavItem => {
        responsiveNavItem.addEventListener('click', () => {
            if (window.getComputedStyle(navbarToggler).display !== 'none') {
                navbarToggler.click();
            }
        });
    });
}

function renderMarkdownSections() {
    marked.use({ mangle: false, headerIds: false });

    const sections = document.querySelectorAll('[data-md-section]');
    const requests = Array.from(sections).map(section => {
        const sectionName = section.dataset.mdSection;
        return fetch(`${contentDir}${sectionName}.md`)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`Failed to load ${sectionName}.md`);
                }
                return response.text();
            })
            .then(markdown => {
                section.innerHTML = marked.parse(markdown);
            })
            .catch(error => console.log(error));
    });

    return Promise.all(requests).then(() => {
        if (typeof MathJax !== 'undefined') {
            MathJax.typeset();
        }
    });
}

function createArticleCard(article, compact) {
    const wrapper = document.createElement('article');
    wrapper.className = compact ? 'article-card article-card-featured' : 'article-card';

    const topic = article.topic ? `<p class="article-meta">${article.topic}</p>` : '';
    wrapper.innerHTML = `
        ${topic}
        <h3 class="article-card-title"><a href="article.html?file=${encodeURIComponent(article.file)}">${article.title}</a></h3>
        <p class="article-card-summary">${article.summary}</p>
        <p class="article-card-link"><a href="article.html?file=${encodeURIComponent(article.file)}">Read article</a></p>
    `;

    return wrapper;
}

function renderArticleLists(articles) {
    const listNodes = document.querySelectorAll('[data-article-list]');
    listNodes.forEach(node => {
        const mode = node.dataset.articleList;
        const limit = Number.parseInt(node.dataset.articleLimit || '0', 10);
        let selectedArticles = articles;

        if (mode === 'featured') {
            selectedArticles = articles.filter(article => article.featured);
        }

        if (limit > 0) {
            selectedArticles = selectedArticles.slice(0, limit);
        }

        selectedArticles.forEach(article => {
            node.appendChild(createArticleCard(article, mode === 'featured'));
        });
    });
}

function loadArticles() {
    const listNodes = document.querySelectorAll('[data-article-list]');
    if (listNodes.length === 0) {
        return Promise.resolve([]);
    }

    return fetch(`${contentDir}${articleManifestFile}`)
        .then(response => {
            if (!response.ok) {
                throw new Error('Failed to load article metadata');
            }
            return response.text();
        })
        .then(text => {
            const yml = jsyaml.load(text);
            const articles = yml.articles || [];
            renderArticleLists(articles);
            return articles;
        })
        .catch(error => {
            console.log(error);
            return [];
        });
}

window.addEventListener('DOMContentLoaded', () => {
    activateResponsiveNav();

    fetch(`${contentDir}${configFile}`)
        .then(response => response.text())
        .then(text => applyConfig(jsyaml.load(text)))
        .catch(error => console.log(error));

    renderMarkdownSections();
    loadArticles();
});
