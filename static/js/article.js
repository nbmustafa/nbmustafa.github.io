function getQueryParam(param) {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get(param);
}

function loadArticleMetadata(fileName) {
    return fetch('contents/articles/index.yml')
        .then(response => {
            if (!response.ok) {
                throw new Error('Failed to load article metadata');
            }
            return response.text();
        })
        .then(text => {
            const articleManifest = jsyaml.load(text);
            const articles = articleManifest.articles || [];
            return articles.find(article => article.file === fileName);
        })
        .catch(error => {
            console.error('Error loading article metadata:', error);
            return null;
        });
}

function loadArticle(fileName) {
    marked.use({ mangle: false, headerIds: false });

    fetch(`contents/articles/${fileName}`)
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

window.addEventListener('DOMContentLoaded', () => {
    const fileName = getQueryParam('file');
    if (!fileName) {
        document.getElementById('article-content').innerHTML = '<p>No article specified. Please provide an article in the URL.</p>';
        return;
    }

    loadArticleMetadata(fileName).then(article => {
        if (article) {
            document.getElementById('article-title').textContent = article.title;
            document.title = `${article.title} | Nashwan Mustafa`;
        }
    });

    loadArticle(fileName);
});
