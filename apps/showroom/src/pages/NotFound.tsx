import { Link } from 'react-router-dom';

export function NotFound() {
  return (
    <section className="section center">
      <h1>We couldn't find that page</h1>
      <p className="muted">The model or page you are looking for does not exist.</p>
      <Link className="btn btn-primary" to="/">
        Back to all models
      </Link>
    </section>
  );
}
