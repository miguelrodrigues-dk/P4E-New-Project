const express = require('express');
const router = express.Router();

// Middlewares de Proteção de Acesso
function verificarAutenticacao(req, res, next) {
  if (!req.session.usuario) return res.redirect('/eventos/cadastro');
  next();
}

function verificarAdmin(req, res, next) {
  if (!req.session.usuario || req.session.usuario.role !== 'admin') {
    return res.status(403).send('Acesso Negado: Apenas administradores podem acessar esta página.');
  }
  next();
}

// Banco de dados em memória para os Eventos do projeto
const eventos = [
  {
    id: 1,
    nome: 'Festival de Música',
    categoria: 'Música',
    data: '15/11/2026',
    local: 'Parque Central',
    descricao: 'Uma noite com música ao vivo, artistas locais e muita energia.',
    imagem: 'https://images.unsplash.com/photo-1459749411175-04bf5292ceea?auto=format&fit=crop&w=1400&q=85',
    destaque: true,
    privado: false,
    criador_email: null,
    comentarios: []
  },
  {
    id: 2,
    nome: 'Noite de Gala',
    categoria: 'Social',
    data: '22/11/2026',
    local: 'Espaço Imperial',
    descricao: 'Uma celebração elegante para reunir pessoas e criar boas memórias.',
   imagem: 'https://images.unsplash.com/photo-1511795409834-ef04bbd61622?auto=format&fit=crop&w=1400&q=85',
    destaque: true,
    privado: false,
    criador_email: null,
    comentarios: []
  },
  {
    id: 3,
    nome: 'Feira Criativa',
    categoria: 'Cultura',
    data: '29/11/2026',
    local: 'Centro Cultural',
    descricao: 'Artesanato, gastronomia e projetos criativos em um só lugar.',
     imagem: 'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?auto=format&fit=crop&w=1400&q=85',
    destaque: true,
    privado: false,
    criador_email: null,
    comentarios: []
  }
];

let proximoEventoId = 4;
let proximoComentarioId = 1;

function buscarEvento(id) {
  return eventos.find(evento => evento.id === Number(id));
}

function buscarComentario(evento, id) {
  return evento.comentarios.find(comentario => comentario.id === Number(id));
}

// Verifica se o usuário logado é Admin ou o criador do evento
function podeGerenciarEvento(evento, usuario) {
  if (!evento || !usuario) return false;
  if (usuario.role === 'admin') return true;
  return Boolean(evento.criador_email && evento.criador_email === usuario.email);
}

// ROTA: Exibir Formulário de Cadastro de Usuário
router.get('/cadastro', (req, res) => {
  if (req.session.usuario) return res.redirect('/eventos');
  res.render('Usuarios/cadastro');
});

// ROTA: Processar o Cadastro de Usuário Comum
router.post('/cadastro', (req, res) => {
  const { nome, email, senha } = req.body;

  global.db.run(
    "INSERT INTO usuarios (nome, email, senha, role) VALUES (?, ?, ?, 'comum')",
    [nome, email, senha],
    function(err) {
      if (err) {
        return res.send("Erro ao cadastrar: Esse e-mail já está sendo utilizado.");
      }

      req.session.usuario = {
        id: this.lastID,
        nome: nome,
        email: email,
        role: 'comum',
        foto: null
      };

      res.redirect('/eventos');
    }
  );
});

// ROTA: Exibir Formulário de Login
router.get('/login', (req, res) => {
  res.render('Usuarios/login', { erro: null });
});

// ROTA: Autenticar Usuário no SQLite
router.post('/login', (req, res) => {
  const { email, senha } = req.body;

  global.db.get(
    "SELECT * FROM usuarios WHERE email = ? AND senha = ?",
    [email, senha],
    (err, user) => {
      if (err || !user) {
        return res.render('Usuarios/login', { erro: 'E-mail ou senha inválidos.' });
      }

      req.session.usuario = {
        id: user.id,
        nome: user.nome,
        email: user.email,
        role: user.role,
        foto: user.foto || null
      };
      res.redirect('/eventos');
    }
  );
});

// CONFIGURAÇÕES DA CONTA
router.get('/configuracoes', verificarAutenticacao, (req, res) => {
  global.db.get(
    'SELECT id, nome, email, role, foto FROM usuarios WHERE id = ?',
    [req.session.usuario.id],
    (err, conta) => {
      if (err || !conta) return res.status(500).send('Não foi possível carregar suas configurações.');
      res.render('Usuarios/configuracoes', {
        conta,
        mensagem: req.query.salvo ? 'Configurações salvas com sucesso!' : null,
        erro: req.query.erro === 'conta-protegida' ? 'A conta principal de administração não pode ser excluída.' : null
      });
    }
  );
});

router.post('/configuracoes', verificarAutenticacao, (req, res) => {
  const nome = (req.body.nome || '').trim();
  const foto = (req.body.foto || '').trim();

  if (nome.length < 2 || nome.length > 50) {
    return global.db.get(
      'SELECT id, nome, email, role, foto FROM usuarios WHERE id = ?',
      [req.session.usuario.id],
      (err, conta) => res.status(400).render('Usuarios/configuracoes', {
        conta, mensagem: null, erro: 'O nome precisa ter entre 2 e 50 caracteres.'
      })
    );
  }

  if (foto && !/^https?:\/\//i.test(foto)) {
    return global.db.get(
      'SELECT id, nome, email, role, foto FROM usuarios WHERE id = ?',
      [req.session.usuario.id],
      (err, conta) => res.status(400).render('Usuarios/configuracoes', {
        conta, mensagem: null, erro: 'A foto precisa ser um link iniciado por http:// ou https://.'
      })
    );
  }

  global.db.run(
    'UPDATE usuarios SET nome = ?, foto = ? WHERE id = ?',
    [nome, foto || null, req.session.usuario.id],
    function (err) {
      if (err) return res.status(500).send('Erro ao salvar as configurações.');
      req.session.usuario.nome = nome;
      req.session.usuario.foto = foto || null;
      res.redirect('/eventos/configuracoes?salvo=1');
    }
  );
});

// EXCLUIR A PRÓPRIA CONTA
router.post('/configuracoes/excluir', verificarAutenticacao, (req, res) => {
  const usuario = req.session.usuario;

  if (usuario.email === 'admin@p4e.com') {
    return res.redirect('/eventos/configuracoes?erro=conta-protegida');
  }

  eventos.forEach(evento => {
    evento.comentarios = evento.comentarios.filter(comentario => {
      if (comentario.autor_email === usuario.email) return false;
      comentario.respostas = (comentario.respostas || []).filter(resposta => resposta.autor_email !== usuario.email);
      return true;
    });
  });

  global.db.run('DELETE FROM usuarios WHERE id = ?', [usuario.id], function (err) {
    if (err) return res.status(500).send('Não foi possível excluir sua conta.');
    req.session.destroy(() => res.redirect('/eventos/cadastro?contaExcluida=1'));
  });
});

// ROTA: Destruir a sessão (Logout)
router.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/eventos/login');
});

// ROTA: Listar Usuários cadastrados (Exclusivo do Admin)
router.get('/admin/usuarios', verificarAutenticacao, verificarAdmin, (req, res) => {
  global.db.all("SELECT id, nome, email, role FROM usuarios", [], (err, rows) => {
    res.render('Usuarios/index', { listaUsuarios: rows });
  });
});

// --- ROTAS DO PROJETO PROTEGIDAS POR LOGIN ---

router.get('/', verificarAutenticacao, (req, res) => {
  const usuario = req.session.usuario;

  const eventosVisiveis = eventos.filter(evento => {
    if (!evento.privado) return true;
    if (usuario.role === 'admin') return true;
    return evento.criador_email === usuario.email;
  });

  // Carrossel: NUNCA mostra eventos privados
  const destaques = eventos.filter(evento => !evento.privado && evento.destaque && evento.imagem);

  res.render('Eventos/index', { eventos: eventosVisiveis, destaques });
});

router.get('/novo', verificarAutenticacao, (req, res) => {
  res.render('Eventos/form-cadastro', { titulo: 'Novo evento | P4E' });
});

router.post('/', verificarAutenticacao, (req, res) => {
  const { nome, categoria, data, local, descricao, destaque, visibilidade } = req.body;
  const isPrivado = visibilidade === 'privado';
  const isDestaque = !isPrivado && destaque === 'on';
  // Salva a imagem mesmo que o evento seja privado ou não esteja em destaque
  const imagem = (req.body.imagem || '').trim();

  const novoEvento = {
    id: proximoEventoId++,
    nome,
    categoria,
    data,
    local,
    descricao,
    imagem,
    destaque: isDestaque,
    privado: isPrivado,
    criador_email: req.session.usuario.email,
    comentarios: []
  };

  eventos.push(novoEvento);

  if (isPrivado) {
    return res.redirect('/eventos/' + novoEvento.id);
  }

  res.redirect('/eventos');
});

router.get('/:id', verificarAutenticacao, (req, res) => {
  const evento = buscarEvento(req.params.id);
  if (!evento) return res.status(404).send('Evento não encontrado.');

  const podeEditarExcluir = podeGerenciarEvento(evento, req.session.usuario);
  res.render('Eventos/detalhes', { evento, podeEditarExcluir });
});

// 🛠️ ROTAS DE EDIÇÃO E EXCLUSÃO DO EVENTO INTEIRO
router.get('/:id/editar', verificarAutenticacao, (req, res) => {
  const evento = buscarEvento(req.params.id);
  if (!evento) return res.status(404).send('Evento não encontrado.');

  if (!podeGerenciarEvento(evento, req.session.usuario)) {
    return res.redirect('/eventos/' + evento.id + '?erro=Acesso Proibido: Apenas o criador do evento ou o Admin podem editar!');
  }

  res.render('Eventos/editar-evento', { evento });
});

router.post('/:id/editar', verificarAutenticacao, (req, res) => {
  const evento = buscarEvento(req.params.id);
  if (!evento) return res.status(404).send('Evento não encontrado.');

  if (!podeGerenciarEvento(evento, req.session.usuario)) {
    return res.redirect('/eventos/' + evento.id + '?erro=Acesso Proibido: Apenas o criador do evento ou o Admin podem editar!');
  }

  const { nome, categoria, data, local, descricao, destaque, visibilidade } = req.body;
  const isPrivado = visibilidade === 'privado';
  const isDestaque = !isPrivado && destaque === 'on';
  // Mantém/atualiza a imagem mesmo se o evento for privado
  const imagem = (req.body.imagem || '').trim();

  Object.assign(evento, {
    nome: nome.trim(),
    categoria,
    data: data.trim(),
    local: local.trim(),
descricao: descricao.trim(),
privado: isPrivado,
destaque: isDestaque,
imagem
});
res.redirect('/eventos/' + evento.id);
});
// ROTA: Excluir um evento completo
router.post('/:id/excluir', verificarAutenticacao, (req, res) => {
const evento = buscarEvento(req.params.id);
if (!evento) return res.status(404).send('Evento não encontrado.');
if (!podeGerenciarEvento(evento, req.session.usuario)) {
return res.redirect('/eventos/' + evento.id + '?erro=Acesso Proibido: Apenas o criador do evento ou o Admin podem excluir!');
}
const indice = eventos.findIndex(item => item.id === evento.id);
eventos.splice(indice, 1);
res.redirect('/eventos');
});
// --- SEÇÃO DE COMENTÁRIOS ---
router.post('/:id/comentarios', verificarAutenticacao, (req, res) => {
const evento = buscarEvento(req.params.id);
if (!evento) return res.status(404).send('Evento não encontrado.');
const autorDigitado = (req.body.autor || '').trim();
const nomeAutor = autorDigitado || req.session.usuario.nome;
evento.comentarios.push({
id: proximoComentarioId++,
autor: nomeAutor,
autor_email: req.session.usuario.email,
autor_foto: req.session.usuario.foto || null,
texto: req.body.texto.trim(),
respostas: []
});
res.redirect('/eventos/' + evento.id + '#comentarios');
});
router.post('/:eventoId/comentarios/:comentarioId/editar', verificarAutenticacao, (req, res) => {
const evento = buscarEvento(req.params.eventoId);
const comentario = buscarComentario(evento, req.params.comentarioId);
if (comentario.autor_email !== req.session.usuario.email && req.session.usuario.role !== 'admin') {
return res.redirect('/eventos/' + evento.id + '?erro=Acesso Proibido: Apenas o autor ou o Admin podem editar este comentario!');
}
comentario.texto = req.body.texto.trim();
res.redirect('/eventos/' + evento.id + '#comentario-' + comentario.id);
});
router.post('/:eventoId/comentarios/:comentarioId/excluir', verificarAutenticacao, (req, res) => {
const evento = buscarEvento(req.params.eventoId);
const comentario = buscarComentario(evento, req.params.comentarioId);
if (comentario.autor_email !== req.session.usuario.email && req.session.usuario.role !== 'admin') {
return res.redirect('/eventos/' + evento.id + '?erro=Acesso Proibido: Voce nao tem permissao para excluir este comentario!');
}
evento.comentarios = evento.comentarios.filter(item => item.id !== comentario.id);
res.redirect('/eventos/' + evento.id + '#comentarios');
});
router.post('/:eventoId/comentarios/:comentarioId/respostas', verificarAutenticacao, (req, res) => {
const evento = buscarEvento(req.params.eventoId);
if (!evento) return res.status(404).send('Evento não encontrado.');
const comentario = buscarComentario(evento, req.params.comentarioId);
if (!comentario) return res.status(404).send('Comentário não encontrado.');
const autorDigitado = (req.body.autor || '').trim();
const nomeAutor = autorDigitado || req.session.usuario.nome;
const texto = (req.body.texto || '').trim();
if (!texto) {
return res.redirect('/eventos/' + evento.id + '?erro=A resposta não pode ficar vazia!');
}
comentario.respostas.push({
id: proximoComentarioId++,
autor: nomeAutor,
autor_email: req.session.usuario.email,
autor_foto: req.session.usuario.foto || null,
texto: texto
});
res.redirect('/eventos/' + evento.id + '#comentario-' + comentario.id);
});

module.exports = router;










/*const eventos = [
  {
    id: 1,
    nome: 'Festival de Música',
    categoria: 'Música',
    data: '15/11/2026',
    local: 'Parque Central',
    descricao: 'Uma noite com música ao vivo, artistas locais e muita energia.',
    imagem: 'https://images.unsplash.com/photo-1459749411175-04bf5292ceea?auto=format&fit=crop&w=1400&q=85',
    destaque: true,
    comentarios: []
  },
  {
    id: 2,
    nome: 'Noite de Gala',
    categoria: 'Social',
    data: '22/11/2026',
    local: 'Espaço Imperial',
    descricao: 'Uma celebração elegante para reunir pessoas e criar boas memórias.',
    imagem: 'https://images.unsplash.com/photo-1511795409834-ef04bbd61622?auto=format&fit=crop&w=1400&q=85',
    destaque: true,
    comentarios: []
  },
  {
    id: 3,
    nome: 'Feira Criativa',
    categoria: 'Cultura',
    data: '29/11/2026',
    local: 'Centro Cultural',
    descricao: 'Artesanato, gastronomia e projetos criativos em um só lugar.',
    imagem: 'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?auto=format&fit=crop&w=1400&q=85',
    destaque: true,
    comentarios: []
  }
];

let proximoEventoId = 4;
let proximoComentarioId = 1;*/