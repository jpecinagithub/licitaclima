import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { apiPost } from '../../lib/api.js';

/**
 * Consumo del magic link. El token llega por query (?token=…) pero NUNCA se
 * consume en GET: esta página es la intermedia y el consumo se hace con
 * POST al confirmar. El token se retira de la URL al navegar al panel.
 */
export function AuthCallbackPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [confirmando, setConfirmando] = useState(false);
  const [error, setError] = useState('');
  const token = params.get('token') ?? '';

  async function onConfirm() {
    setConfirmando(true);
    setError('');
    try {
      await apiPost('/auth/consume-link', { token });
      navigate('/app', { replace: true });
    } catch {
      setError(
        'El enlace no es válido o ya caducó (15 minutos, un solo uso). Solicita un enlace nuevo.',
      );
    } finally {
      setConfirmando(false);
    }
  }

  if (!token) {
    return (
      <div>
        <h1>Enlace de acceso no válido</h1>
        <p>Este enlace no contiene un código de acceso. Solicita un enlace nuevo desde la página de acceso.</p>
        <p>
          <Link to="/acceso">Ir a Acceso clientes</Link>
        </p>
      </div>
    );
  }

  return (
    <div>
      <h1>Confirmar acceso</h1>
      <p>
        Has llegado desde un enlace de acceso de LicitaClima. Pulsa «Confirmar acceso» para entrar en tu panel.
        El enlace quedará consumido y no podrá reutilizarse.
      </p>
      <button type="button" className="btn" onClick={onConfirm} disabled={confirmando}>
        {confirmando ? 'Confirmando…' : 'Confirmar acceso'}
      </button>{' '}
      <Link className="btn btn-secondary" to="/">
        Cancelar
      </Link>
      {error ? (
        <p className="field-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
