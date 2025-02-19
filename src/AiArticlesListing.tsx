import React, { useState, useEffect } from 'react';

interface Article {
  id: number;
  article_url: string;
  pmid: string;
  doi: string;
  title: string;
  background: string;
  methods: string;
  results: string;
  conclusions: string;
  sponsor: string;
  publication_date: string;
  drug_id: number;
  publication_type: string;
  ai_heading: string;
  ai_background: string;
  ai_conclusion: string;
  key_terms: string;
}

function AiArticlesListing() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('http://127.0.0.1:8000/api/articles')
      .then((res) => res.json())
      .then((data) => {
        if (data.status === 'success') {
          setArticles(data.articles);
        } else {
          setError(data.message || 'Error fetching articles');
        }
        setLoading(false);
      })
      .catch((err) => {
        setError(err.toString());
        setLoading(false);
      });
  }, []);

  if (loading) return <p>Loading AI articles...</p>;
  if (error) return <p>Error: {error}</p>;

  return (
    <div className="ai-articles-listing" style={{ marginTop: '2rem' }}>
      <h2>AI-Generated Articles</h2>
      {articles.map((article) => (
        <details key={article.id} className="article-block" style={{ marginBottom: '1rem', border: '1px solid #ccc', padding: '0.5rem' }}>
          <summary style={{ fontWeight: 'bold', cursor: 'pointer' }}>
            {article.title} — {article.publication_type} — {article.publication_date} — PMID: {article.pmid}
          </summary>
          <div style={{ paddingLeft: '1rem' }}>
            <details className="section-block" style={{ marginTop: '0.5rem' }}>
              <summary style={{ cursor: 'pointer' }}>Key Terms</summary>
              <pre style={{ whiteSpace: 'pre-wrap', margin: '0.5rem 0' }}>{article.key_terms}</pre>
            </details>
            <details className="section-block" style={{ marginTop: '0.5rem' }}>
              <summary style={{ cursor: 'pointer' }}>AI Heading</summary>
              <pre style={{ whiteSpace: 'pre-wrap', margin: '0.5rem 0' }}>{article.ai_heading}</pre>
            </details>
            <details className="section-block" style={{ marginTop: '0.5rem' }}>
              <summary style={{ cursor: 'pointer' }}>AI Background</summary>
              <pre style={{ whiteSpace: 'pre-wrap', margin: '0.5rem 0' }}>{article.ai_background}</pre>
            </details>
            <details className="section-block" style={{ marginTop: '0.5rem' }}>
              <summary style={{ cursor: 'pointer' }}>AI Conclusion</summary>
              <pre style={{ whiteSpace: 'pre-wrap', margin: '0.5rem 0' }}>{article.ai_conclusion}</pre>
            </details>
          </div>
        </details>
      ))}
    </div>
  );
}

export default AiArticlesListing;