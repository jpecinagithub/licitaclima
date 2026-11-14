import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { requestMagicLink } from '../../lib/api.js';

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [enviado, setEnviado] = useState(false);
  const [error, setError] = useState('');

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    try {
      await requestMagicLink(email);
      setEnviado(true);
    } catch {
      // Respuesta genérica para evitar enumeración: no se distingue si existe la cuenta.
      setEnviado(true);
    }
  }

  return (
    <div>
      <h1>Acceso clientes</h1>
      {enviado ? (
        <div role="status">
          <p>
            Si existe una cuenta con ese correo, te hemos enviado un enlace de acceso. El enlace es de un solo uso
            y caduca en 15 minutos. Revisa también la carpeta de correo no deseado.
          </p>
          <p>
            <Link to="/">Volver al inicio</Link>
          </p>
        </div>
      ) : (
        <form onSubmit={onSubmit} aria-label="Solicitar enlace de acceso">
          <p>
            Acceso sin contraseña: te enviamos un enlace de un solo uso a tu correo. Si aún no tienes cuenta,
            el enlace te permite crearla y completar tu perfil.
          </p>
          <div className="field">
            <label htmlFor="login-email">Correo electrónico</label>
            <input
              id="login-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <button type="submit" className="btn">
            Enviarme el enlace
          </button>
          {error ? (
            <p className="field-error" role="alert">
              {error}
            </p>
          ) : null}
          <p className="help">
            El enlace caduca en 15 minutos y solo puede usarse una vez. Si tu lector de correo abre los enlaces
            automáticamente, no te preocupes: el enlace solo se consume cuando confirmas el acceso en la página
            intermedia.
          </p>
        </form>
      )}
    </div>
  );
}
