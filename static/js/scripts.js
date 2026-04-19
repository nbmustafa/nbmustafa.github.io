const contentDir = 'contents/';
const configFile = 'config.yml';
const articleManifestFile = 'articles/index.json';

const articleTopicMap = {
    ai: 'AI',
    aws: 'AWS',
    'aws-security': 'AWS Security',
    certification: 'Certification',
    'cloud-architecture': 'Cloud Architecture',
    'exams-prep': 'Exams Prep',
    kubernetes: 'Kubernetes',
    'kubernetes-networking': 'Kubernetes Networking',
    observability: 'Observability',
};

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

    if (/[A-Z]{2,}/.test(segment) || /^[A-Z0-9]+$/.test(segment)) {
        return segment;
    }

    const knownTerms = {
        ai: 'AI',
        api: 'API',
        argocd: 'ArgoCD',
        aws: 'AWS',
        ci: 'CI',
        ckad: 'CKAD',
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
    if (knownTerms[lowerSegment]) {
        return knownTerms[lowerSegment];
    }

    return segment.charAt(0).toUpperCase() + segment.slice(1).toLowerCase();
}

function titleFromFileName(relativePath) {
    const fileName = relativePath.split('/').pop().replace(/\.md$/i, '');
    return fileName
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .replace(/[_-]+/g, ' ')
        .trim()
        .split(/\s+/)
        .map(titleCaseSegment)
        .join(' ');
}

function topicFromRelativePath(relativePath) {
    const [folderName] = relativePath.split('/');
    return articleTopicMap[folderName] || titleFromFileName(folderName);
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

function loadArticleManifest() {
    return fetch(`${contentDir}${articleManifestFile}`)
        .then(response => {
            if (!response.ok) {
                throw new Error('Failed to load article metadata');
            }
            return response.json();
        })
        .then(payload => payload.articles || []);
}

function loadArticles() {
    const listNodes = document.querySelectorAll('[data-article-list]');
    const topicNav = document.querySelector('[data-article-topics]');
    if (listNodes.length === 0 && !topicNav) {
        return Promise.resolve([]);
    }

    return loadArticleManifest()
        .then(articles => {
            renderTopicNav(articles);
            renderArticleLists(articles);
            return articles;
        })
        .catch(error => {
            console.log(error);
            return [];
        });
}

window.ArticleCatalog = {
    contentDir,
    articleManifestFile,
    titleFromFileName,
    topicFromRelativePath,
    formatArticleDate,
    loadArticleManifest,
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
