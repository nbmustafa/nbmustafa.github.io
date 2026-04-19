const contentDir = 'contents/';
const configFile = 'config.yml';
const articleRootDir = 'articles/';
const articleRepo = {
    owner: 'nbmustafa',
    repo: 'nbmustafa.github.io',
    ref: ['localhost', '127.0.0.1'].includes(window.location.hostname) ? 'more-fixes' : 'gh-pages',
};

const articleTopicMap = {
    ai: 'AI',
    aws: 'AWS',
    'aws-security': 'AWS Security',
    certification: 'Certification',
    'cloud-architecture': 'Cloud Architecture',
    kubernetes: 'Kubernetes',
    'kubernetes-networking': 'Kubernetes Networking',
    observability: 'Observability',
};

const featuredArticleFiles = new Set([
    'ai/kubernetes-cost-optimizer.md',
    'aws-security/eso-managing-cross-account-secrets.md',
    'kubernetes/kubernetes-sandbox.md',
]);

const articleCacheVersion = 'v2';
const articleCatalogCacheKey = `article-catalog:${articleCacheVersion}:${articleRepo.ref}`;
const articleDateCachePrefix = `article-created:${articleCacheVersion}:${articleRepo.ref}:`;
const articleCatalogCacheTtlMs = 12 * 60 * 60 * 1000;

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

function slugifyTopic(topic) {
    return topic.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function titleCaseSegment(segment) {
    if (!segment) {
        return '';
    }

    if (/[A-Z]{2,}/.test(segment)) {
        return segment;
    }

    if (/^[A-Z0-9]+$/.test(segment)) {
        return segment;
    }

    const knownAcronyms = {
        ai: 'AI',
        api: 'API',
        argocd: 'ArgoCD',
        aws: 'AWS',
        bedrock: 'Bedrock',
        ci: 'CI',
        ckad: 'CKAD',
        dns: 'DNS',
        ecr: 'ECR',
        eks: 'EKS',
        finops: 'FinOps',
        gitops: 'GitOps',
        helm: 'Helm',
        istio: 'Istio',
        k8s: 'K8s',
        kubernetes: 'Kubernetes',
        mlops: 'MLOps',
        nlb: 'NLB',
        oomkilled: 'OOMKilled',
        rag: 'RAG',
        s3: 'S3',
        sse: 'SSE',
        terraform: 'Terraform',
        ui: 'UI',
        vpcendpoint: 'VPCEndpoint',
    };

    const lowerSegment = segment.toLowerCase();
    if (knownAcronyms[lowerSegment]) {
        return knownAcronyms[lowerSegment];
    }

    return segment.charAt(0).toUpperCase() + segment.slice(1).toLowerCase();
}

function titleFromFileName(relativePath) {
    const fileName = relativePath.split('/').pop().replace(/\.md$/i, '');
    const normalized = fileName.replace(/[_-]+/g, ' ').trim();
    return normalized
        .split(/\s+/)
        .map(titleCaseSegment)
        .join(' ');
}

function topicFromRelativePath(relativePath) {
    const [folderName] = relativePath.split('/');
    return articleTopicMap[folderName] || titleFromFileName(folderName);
}

function extractSummary(markdown) {
    const lines = markdown.split('\n');
    const paragraphLines = [];

    for (const rawLine of lines) {
        const line = rawLine.trim();

        if (!line) {
            if (paragraphLines.length > 0) {
                break;
            }
            continue;
        }

        if (
            line.startsWith('#') ||
            line.startsWith('![') ||
            line.startsWith('<img') ||
            line.startsWith('```') ||
            line.startsWith('---') ||
            line.startsWith('|') ||
            line.startsWith('>') ||
            line.startsWith('- ') ||
            line.startsWith('* ') ||
            /^\d+\.\s/.test(line)
        ) {
            if (paragraphLines.length > 0) {
                break;
            }
            continue;
        }

        paragraphLines.push(line);
    }

    const summary = paragraphLines
        .join(' ')
        .replace(/\[(.*?)\]\((.*?)\)/g, '$1')
        .replace(/[`*_>#]/g, '')
        .replace(/\s+/g, ' ')
        .trim();

    if (!summary) {
        return 'Read the full article for practical notes, patterns, and implementation details.';
    }

    return summary.length > 220 ? `${summary.slice(0, 217).trimEnd()}...` : summary;
}

function formatArticleDate(dateString) {
    const parsedDate = dateString instanceof Date
        ? dateString
        : new Date(`${dateString}T00:00:00`);
    if (Number.isNaN(parsedDate.getTime())) {
        return String(dateString);
    }

    return parsedDate.toLocaleDateString('en-AU', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
    });
}

function compareArticlesByDate(left, right) {
    if (!left.date && !right.date) {
        return left.title.localeCompare(right.title);
    }
    if (!left.date) {
        return 1;
    }
    if (!right.date) {
        return -1;
    }

    const leftDate = left.date instanceof Date ? left.date : new Date(`${left.date}T00:00:00`);
    const rightDate = right.date instanceof Date ? right.date : new Date(`${right.date}T00:00:00`);

    return rightDate - leftDate;
}

function createArticleCard(article, compact) {
    const wrapper = document.createElement('article');
    wrapper.className = compact ? 'article-card article-card-featured' : 'article-card';

    const topic = article.topic ? `<p class="article-meta">${article.topic}</p>` : '';
    const date = article.date ? `<p class="article-card-date">${formatArticleDate(article.date)}</p>` : '';
    wrapper.innerHTML = `
        ${topic}
        <h3 class="article-card-title"><a href="article.html?file=${encodeURIComponent(article.file)}">${article.title}</a></h3>
        ${date}
        <p class="article-card-summary">${article.summary}</p>
        <p class="article-card-link"><a href="article.html?file=${encodeURIComponent(article.file)}">Read article</a></p>
    `;

    return wrapper;
}

function renderTopicNav(articles) {
    const topicNav = document.querySelector('[data-article-topics]');
    if (!topicNav) {
        return;
    }

    topicNav.innerHTML = '';
    const topics = [...new Set(articles.map(article => article.topic).filter(Boolean))].sort();
    topics.forEach(topic => {
        const link = document.createElement('a');
        link.className = 'article-topic-link';
        link.href = `#topic-${slugifyTopic(topic)}`;
        link.textContent = topic;
        topicNav.appendChild(link);
    });
}

function renderGroupedArticles(articles, node) {
    node.innerHTML = '';
    const topics = [...new Set(articles.map(article => article.topic).filter(Boolean))].sort();

    topics.forEach(topic => {
        const section = document.createElement('section');
        section.className = 'article-topic-section';
        section.id = `topic-${slugifyTopic(topic)}`;

        const heading = document.createElement('h2');
        heading.className = 'article-topic-heading';
        heading.textContent = topic;
        section.appendChild(heading);

        const cards = document.createElement('div');
        cards.className = 'article-list';
        articles
            .filter(article => article.topic === topic)
            .sort(compareArticlesByDate)
            .forEach(article => cards.appendChild(createArticleCard(article, false)));

        section.appendChild(cards);
        node.appendChild(section);
    });
}

function renderArticleLists(articles) {
    const listNodes = document.querySelectorAll('[data-article-list]');
    listNodes.forEach(node => {
        const mode = node.dataset.articleList;
        const limit = Number.parseInt(node.dataset.articleLimit || '0', 10);
        let selectedArticles = articles;

        node.innerHTML = '';

        if (mode === 'featured') {
            selectedArticles = articles.filter(article => article.featured).sort(compareArticlesByDate);
        }

        if (mode === 'grouped') {
            renderGroupedArticles(articles, node);
            return;
        }

        if (limit > 0) {
            selectedArticles = selectedArticles.slice(0, limit);
        }

        selectedArticles.forEach(article => {
            node.appendChild(createArticleCard(article, mode === 'featured'));
        });
    });
}

function loadCachedArticleCatalog() {
    try {
        const cachedValue = window.localStorage.getItem(articleCatalogCacheKey);
        if (!cachedValue) {
            return null;
        }

        const parsedValue = JSON.parse(cachedValue);
        if (!parsedValue.createdAt || !Array.isArray(parsedValue.articles)) {
            return null;
        }

        if ((Date.now() - parsedValue.createdAt) > articleCatalogCacheTtlMs) {
            return null;
        }

        return parsedValue.articles;
    } catch (error) {
        console.warn('Unable to read article cache:', error);
        return null;
    }
}

function saveCachedArticleCatalog(articles) {
    try {
        window.localStorage.setItem(articleCatalogCacheKey, JSON.stringify({
            createdAt: Date.now(),
            articles,
        }));
    } catch (error) {
        console.warn('Unable to store article cache:', error);
    }
}

function loadCachedArticleDate(relativePath) {
    try {
        return window.localStorage.getItem(`${articleDateCachePrefix}${relativePath}`);
    } catch (error) {
        return null;
    }
}

function saveCachedArticleDate(relativePath, dateValue) {
    try {
        window.localStorage.setItem(`${articleDateCachePrefix}${relativePath}`, dateValue);
    } catch (error) {
        console.warn('Unable to store article date cache:', error);
    }
}

function fetchGitHubJson(url) {
    return fetch(url, {
        headers: {
            Accept: 'application/vnd.github+json',
        },
    }).then(response => {
        if (!response.ok) {
            throw new Error(`GitHub request failed: ${response.status}`);
        }
        return response.json();
    });
}

function discoverArticleFiles() {
    const treeUrl = `https://api.github.com/repos/${articleRepo.owner}/${articleRepo.repo}/git/trees/${articleRepo.ref}?recursive=1`;
    return fetchGitHubJson(treeUrl).then(payload => {
        const tree = Array.isArray(payload.tree) ? payload.tree : [];
        return tree
            .filter(item => item.type === 'blob')
            .map(item => item.path)
            .filter(path => path.startsWith('contents/articles/') && path.endsWith('.md'))
            .map(path => path.replace('contents/articles/', ''))
            .filter(path => {
                const [folderName] = path.split('/');
                return Boolean(articleTopicMap[folderName]);
            })
            .sort((left, right) => left.localeCompare(right));
    });
}

async function fetchArticleCreatedDate(relativePath) {
    const cachedDate = loadCachedArticleDate(relativePath);
    if (cachedDate) {
        return cachedDate;
    }

    const encodedPath = encodeURIComponent(`contents/articles/${relativePath}`);
    let page = 1;
    let oldestCommitDate = null;

    while (page < 11) {
        const commitsUrl = `https://api.github.com/repos/${articleRepo.owner}/${articleRepo.repo}/commits?sha=${articleRepo.ref}&path=${encodedPath}&per_page=100&page=${page}`;
        const commits = await fetchGitHubJson(commitsUrl);

        if (!Array.isArray(commits) || commits.length === 0) {
            break;
        }

        oldestCommitDate = commits[commits.length - 1].commit.author.date;

        if (commits.length < 100) {
            break;
        }

        page += 1;
    }

    const formattedDate = oldestCommitDate ? oldestCommitDate.slice(0, 10) : '';
    if (formattedDate) {
        saveCachedArticleDate(relativePath, formattedDate);
    }
    return formattedDate;
}

async function buildArticleMetadata(relativePath) {
    const markdown = await fetch(`${contentDir}${articleRootDir}${relativePath}`).then(response => {
        if (!response.ok) {
            throw new Error(`Failed to load article body for ${relativePath}`);
        }
        return response.text();
    });

    let date = '';
    try {
        date = await fetchArticleCreatedDate(relativePath);
    } catch (error) {
        console.warn(`Unable to fetch created date for ${relativePath}:`, error);
    }

    return {
        file: relativePath,
        title: titleFromFileName(relativePath),
        summary: extractSummary(markdown),
        topic: topicFromRelativePath(relativePath),
        date,
        featured: featuredArticleFiles.has(relativePath),
    };
}

async function loadArticles() {
    const listNodes = document.querySelectorAll('[data-article-list]');
    const topicNav = document.querySelector('[data-article-topics]');
    if (listNodes.length === 0 && !topicNav) {
        return [];
    }

    const cachedArticles = loadCachedArticleCatalog();
    if (cachedArticles) {
        renderTopicNav(cachedArticles);
        renderArticleLists(cachedArticles);
        return cachedArticles;
    }

    try {
        const articleFiles = await discoverArticleFiles();
        const articles = await Promise.all(articleFiles.map(buildArticleMetadata));
        articles.sort(compareArticlesByDate);
        saveCachedArticleCatalog(articles);
        renderTopicNav(articles);
        renderArticleLists(articles);
        return articles;
    } catch (error) {
        console.log(error);
        return [];
    }
}

window.ArticleCatalog = {
    contentDir,
    articleRootDir,
    articleRepo,
    articleTopicMap,
    titleFromFileName,
    topicFromRelativePath,
    formatArticleDate,
    fetchArticleCreatedDate,
    loadArticles,
};

window.addEventListener('DOMContentLoaded', () => {
    activateResponsiveNav();

    fetch(`${contentDir}${configFile}`)
        .then(response => response.text())
        .then(text => applyConfig(jsyaml.load(text)))
        .catch(error => console.log(error));

    renderMarkdownSections();
    loadArticles();
});
