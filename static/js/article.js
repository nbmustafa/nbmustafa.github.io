function getQueryParam(param) {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get(param);
}

function loadArticle(fileName) {
    marked.use({ mangle: false, headerIds: false });

    fetch(`${window.ArticleCatalog.contentDir}articles/${fileName}`)
        .then(response => {
            if (!response.ok) {
                throw new Error(`Failed to load ${fileName}: ${response.statusText}`);
            }
            return response.text();
        })
        .then(markdown => {
            document.getElementById('article-content').innerHTML = marked.parse(markdown);
            if (typeof MathJax !== 'undefined') {
                MathJax.typeset();
            }
        })
        .catch(error => {
            console.error('Error loading markdown:', error);
            document.getElementById('article-content').innerHTML = '<p>Unable to load this article.</p>';
        });
}

function loadArticleMeta(fileName) {
    const metaNode = document.getElementById('article-meta-date');
    if (!metaNode) {
        return;
    }

    window.ArticleCatalog.loadArticleManifest()
        .then(articles => articles.find(article => article.file === fileName))
        .then(article => {
            if (!article || !article.date) {
                metaNode.remove();
                return;
            }

            metaNode.textContent = `Published ${window.ArticleCatalog.formatArticleDate(article.date)}`;
        })
        .catch(error => {
            console.warn('Unable to load article metadata:', error);
            metaNode.remove();
        });
}

window.addEventListener('DOMContentLoaded', () => {
    const fileName = getQueryParam('file');
    if (!fileName) {
        document.getElementById('article-content').innerHTML = '<p>No article specified. Please provide an article in the URL.</p>';
        return;
    }

    const articleTitle = window.ArticleCatalog.titleFromFileName(fileName);
    document.title = `${articleTitle} | Nashwan Mustafa`;

    loadArticleMeta(fileName);
    loadArticle(fileName);
});
