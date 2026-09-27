<?php
if(session_status()===PHP_SESSION_NONE) session_start();
function e($v){return htmlspecialchars((string)$v,ENT_QUOTES,'UTF-8');}
function logged(){return isset($_SESSION['user']);}
function require_login(){if(!logged()){header('Location: login.php');exit;}}
function role(){return $_SESSION['user']['role']??'';}
function allow($roles){if(!in_array(role(),$roles,true)){http_response_code(403);die('Akses ditolak.');}}
function csrf(){if(empty($_SESSION['csrf']))$_SESSION['csrf']=bin2hex(random_bytes(24));return $_SESSION['csrf'];}
function verify_csrf(){if($_SERVER['REQUEST_METHOD']==='POST' && !hash_equals($_SESSION['csrf']??'',$_POST['csrf']??''))die('CSRF token tidak valid.');}
?>